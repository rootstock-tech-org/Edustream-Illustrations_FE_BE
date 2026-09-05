"""
Simulation Loop
================
The main game loop running in a background thread.
Orchestrates conveyor movement, sensor scanning, and AI decisions.
Emits state updates to all connected WebSocket clients.
"""

import threading
import time
from collections import deque
import base64
import cv2
import numpy as np

from conveyor.conveyor_map import ConveyorMap
from conveyor.item_spawner import ItemSpawner
from sensors.mock_provider import MockSensorProvider
from sensors.sensor_interface import SensorProvider
from ai_core.decision_engine import DecisionEngine
from ai_core.segmenter import InstanceSegmenter
import config


class SimulationLoop:
    # Trailing window for the throughput figure. A rate needs averaging or it
    # jitters with every item, but too long and a spawn-rate change takes a
    # minute to show. 30 s converges while you are still looking at the slider
    # and still sees ~5 items at the lowest usable spawn rate.
    THROUGHPUT_WINDOW_S = 30.0

    """
    Background simulation loop that ties all layers together.
    
    Each tick:
      1. Spawner generates items → placed on conveyor
      2. Conveyor advances all items
      3. Items in scan zone get scanned by sensor provider
      4. AI decision engine classifies each scanned item
      5. State emitted to frontend via SocketIO
    """

    def __init__(self, socketio):
        self.socketio = socketio
        self.running = False
        self._thread: threading.Thread | None = None

        # Core modules
        self.conveyor = ConveyorMap()
        self.spawner = ItemSpawner()
        self.sensor_provider: SensorProvider = self._select_sensor_provider()
        self.decision_engine = DecisionEngine()
        self.segmenter = InstanceSegmenter()

        # Noise multipliers (adjustable from UI)
        self.noise_scale = 1.0

        # Last sensor data for the "currently scanning" item (for UI display)
        self._current_scan_data: dict | None = None
        
        # Throttle sensor view generation
        self._last_sensor_view_time = 0.0

        # Rolling window of (timestamp, completed_count) for _measure_throughput
        self._throughput_samples: deque[tuple[float, int]] = deque()

        # Independent throttle for the real camera feed (see _collect_camera_frames)
        self._last_camera_emit_time = 0.0

        # Tick-error throttle: {"<type>: <msg>": {"count", "last_report"}}
        self._tick_errors: dict[str, dict] = {}

    def initialize(self):
        """Initialize the AI model (train on synthetic data)."""
        print("[SimLoop] Initializing AI Decision Engine...")
        accuracy = self.decision_engine.initialize()
        print(f"[SimLoop] AI ready. Training accuracy: {accuracy:.3f}")
        self.sensor_provider.initialize()

    def start(self):
        """Start the simulation in a background thread."""
        if self.running:
            self.paused = False
            return
            
        self.running = True
        self.paused = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[SimLoop] Simulation started.")

    def stop(self):
        """Pause the simulation logic without shutting down hardware."""
        self.paused = True
        print("[SimLoop] Simulation paused.")

    def shutdown(self):
        """Completely stop the simulation and shutdown sensors."""
        self.running = False
        if self._thread:
            self._thread.join(timeout=2.0)
        self.sensor_provider.shutdown()
        print("[SimLoop] Simulation shut down.")

    def reset(self):
        """Reset the simulation state."""
        self.conveyor.items.clear()
        self.conveyor.total_spawned = 0
        self.conveyor.total_passed = 0
        self.conveyor.total_diverted = 0
        self.conveyor.sim_time = 0.0
        self.segmenter.tracks.clear()
        self.segmenter.next_id = 1
        self.decision_engine.reset()
        self._current_scan_data = None
        # The counters just went back to zero; stale samples would make the
        # rolling delta negative until the window aged out.
        self._throughput_samples.clear()
        print("[SimLoop] Simulation reset.")

    def spawn_manual(self, item_type: str):
        """Manually spawn a specific item type (from UI)."""
        try:
            item = self.spawner.spawn_specific(item_type, self.conveyor.belt_width)
            self.conveyor.spawn_item(item)
            return item.to_dict()
        except ValueError as e:
            return {"error": str(e)}

    def update_config(self, updates: dict):
        """Update simulation parameters from UI controls."""
        if "speed" in updates:
            self.conveyor.update_speed(float(updates["speed"]))
        if "spawn_rate" in updates:
            self.spawner.update_spawn_rate(float(updates["spawn_rate"]))
        if "noise_scale" in updates:
            self.noise_scale = max(0.0, min(3.0, float(updates["noise_scale"])))
        if "belt_width" in updates:
            self.conveyor.belt_width = max(0.8, min(2.0, float(updates["belt_width"])))
            self._reseat_items_on_belt()
            
        # Interactive Lab Toggles
        if "sim_lab" in updates:
            lab_cfg = updates["sim_lab"]
            if "vision" in lab_cfg: config.SIM_LAB_ENABLE_VISION = bool(lab_cfg["vision"])
            if "nir" in lab_cfg: config.SIM_LAB_ENABLE_NIR = bool(lab_cfg["nir"])
            if "load_cell" in lab_cfg: config.SIM_LAB_ENABLE_LOAD_CELL = bool(lab_cfg["load_cell"])
            if "inductive" in lab_cfg: config.SIM_LAB_ENABLE_INDUCTIVE = bool(lab_cfg["inductive"])
            if "capacitive" in lab_cfg: config.SIM_LAB_ENABLE_CAPACITIVE = bool(lab_cfg["capacitive"])
            if "dust_fault" in lab_cfg: config.SIM_LAB_INJECT_DUST_FAULT = bool(lab_cfg["dust_fault"])

    def _reseat_items_on_belt(self) -> None:
        """Pull items already on the belt inside the new belt width.

        Narrowing the belt would otherwise leave in-flight items hanging off its
        edges — the spawner only applies the edge margin at spawn time. Items keep
        their side of the centreline; they are only pulled in as far as needed.
        """
        half = self.conveyor.belt_width / 2
        for item in self.conveyor.items.values():
            limit = max(0.0, half - (item.width / 2 + 0.05))
            if abs(item.position_x) > limit:
                item.position_x = limit if item.position_x > 0 else -limit

    @staticmethod
    def _select_sensor_provider() -> SensorProvider:
        """Pick the provider for config.SENSOR_MODE, refusing to return a broken one.

        Every provider must implement get_sensor_streams(), which the loop calls
        every tick. RealSensorProvider is a hardware template and does not — left
        unchecked it raises AttributeError 30 times a second forever, which reads
        as "the app runs but nothing moves" and fills the log with tracebacks.
        An unusable mode degrades to MOCK loudly instead: a demo that runs and
        says so beats a deployment that looks up and is not.
        """
        mode = getattr(config, "SENSOR_MODE", "MOCK")
        provider = None

        if mode == "HYBRID":
            # Degrades to mock sensors by itself when pyrealsense2 or the camera
            # is missing; only the /camera view depends on the hardware.
            from sensors.hybrid_provider import HybridSensorProvider
            provider = HybridSensorProvider()
        elif mode == "REAL":
            from sensors.real_provider import RealSensorProvider
            provider = RealSensorProvider()
        elif mode != "MOCK":
            print(f"[SimLoop] Unknown SMARTSEG_SENSOR_MODE={mode!r}; using MOCK.")

        if provider is not None and not callable(getattr(provider, "get_sensor_streams", None)):
            print(
                f"[SimLoop] SENSOR_MODE={mode} selected "
                f"{type(provider).__name__}, which does not implement "
                "get_sensor_streams() and cannot drive the pipeline. "
                "Falling back to MOCK sensors."
            )
            provider = None

        return provider if provider is not None else MockSensorProvider()

    @property
    def active_sensor_mode(self) -> str:
        """The mode actually in effect, which is not always config.SENSOR_MODE.

        Reported to the UI so the mode badge cannot claim hardware that is not
        there: an unusable provider falls back to MOCK, and HYBRID without a
        camera is really MOCK plus a dead /camera view.
        """
        name = type(self.sensor_provider).__name__
        if name == "HybridSensorProvider":
            return "HYBRID" if getattr(self.sensor_provider, "camera_ready", False) else "HYBRID (no camera)"
        if name == "RealSensorProvider":
            return "REAL"
        return "MOCK"

    def get_line_config(self) -> dict:
        """The authoritative Line Control setpoints.

        Emitted alongside every state update so a client can sync its sliders to
        what the server actually holds — a second tab, a reconnect, or a value the
        server clamped would otherwise show stale defaults. Unlike ``state["speed"]``
        this reports the configured speed even while the line is stopped, which is
        what the belt will run at when it restarts.
        """
        return {
            "speed": round(self.conveyor.speed, 2),
            "spawn_rate": round(self.spawner.spawn_rate),
            "belt_width": round(self.conveyor.belt_width, 2),
            "noise_scale": round(self.noise_scale, 2),
            "paused": self.paused,
        }

    def get_sensor_detail(self, item_id: str) -> dict | None:
        """Get detailed sensor data for a specific item."""
        return self._current_scan_data

    def _measure_throughput(self, stats: dict) -> float:
        """Items actually leaving the belt, per minute, over a trailing window.

        The UI used to display a hardcoded "~120", so the Throughput KPI never
        moved no matter what the spawn rate was set to. This measures the real
        thing: completions (passed + diverted) sampled against wall-clock time.

        Samples older than the window are dropped, so the figure tracks a change
        in spawn rate promptly rather than averaging over the whole run. Below
        two samples there is nothing to differentiate, so it reports 0.
        """
        # A stopped line produces nothing; without this the last rate would sit
        # frozen on screen, because simulated time stops advancing too.
        if self.paused:
            return 0.0

        done = stats.get("total_passed", 0) + stats.get("total_diverted", 0)

        # Measured against *simulated* time, not the wall clock. The loop
        # advances the world by a nominal 1/TICK_RATE_HZ per tick but cannot
        # always hit that rate on a busy host, so simulated time runs slower
        # than real time. The spawner works in simulated minutes; measuring this
        # in real ones made a 300/min setpoint read as roughly 100/min.
        now = self.conveyor.sim_time

        # One sample per simulated second is plenty at 30 ticks/s.
        if not self._throughput_samples or now - self._throughput_samples[-1][0] >= 1.0:
            self._throughput_samples.append((now, done))

        cutoff = now - self.THROUGHPUT_WINDOW_S
        while len(self._throughput_samples) > 2 and self._throughput_samples[0][0] < cutoff:
            self._throughput_samples.popleft()

        if len(self._throughput_samples) < 2:
            return 0.0
        (t0, d0), (t1, d1) = self._throughput_samples[0], self._throughput_samples[-1]
        elapsed = t1 - t0
        if elapsed < 1.0:
            return 0.0
        return round(max(0, d1 - d0) / elapsed * 60.0, 1)

    def camera_status(self) -> dict:
        """What the /camera page needs to say what it is showing.

        Without this the page silently falls back to the synthetic feed when the
        hardware fails, so a dead camera and a working one look identical.
        """
        provider = self.sensor_provider
        supported = callable(getattr(provider, "get_camera_frame", None))
        ready = bool(getattr(provider, "camera_ready", False))
        return {
            "mode": self.active_sensor_mode,
            "supported": supported,          # provider can drive real hardware at all
            "ready": ready,                  # camera is streaming right now
            "error": getattr(provider, "camera_error", None),
            "source": "live" if ready else "synthetic",
        }

    def _collect_camera_frames(self) -> dict | None:
        """JPEG-encode the latest real camera frames, throttled to 10 Hz.

        Deliberately not part of _generate_sensor_views(): that path only runs
        once the simulation has produced a sensor frame, so the live feed used to
        go dark whenever the line was stopped and never appeared at all before the
        first unpaused tick. The camera is hardware — it keeps running either way.
        """
        if not callable(getattr(self.sensor_provider, "get_camera_frame", None)):
            return None
        if time.time() - self._last_camera_emit_time < 0.1:
            return None

        cam_rgb, cam_depth = self.sensor_provider.get_camera_frame()
        if cam_rgb is None and cam_depth is None:
            return None
        self._last_camera_emit_time = time.time()

        payload = {}
        if cam_rgb is not None:
            bgr = cv2.cvtColor(cam_rgb, cv2.COLOR_RGB2BGR)
            _, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
            payload["rgb"] = base64.b64encode(buf).decode("ascii")
        if cam_depth is not None:
            _, buf = cv2.imencode(".jpg", cam_depth, [cv2.IMWRITE_JPEG_QUALITY, 70])
            payload["depth"] = base64.b64encode(buf).decode("ascii")
        return payload or None

    def _log_tick_error(self, exc: Exception) -> None:
        """Report a tick failure without flooding the log.

        The loop runs at 30 Hz, so a persistent fault — a provider missing a
        method, a sensor that stopped responding — would otherwise print thirty
        tracebacks a second and fill the disk of whatever it is deployed on. The
        first occurrence of each distinct error gets a full traceback; repeats
        are counted and summarised at most once a minute.
        """
        import traceback

        key = f"{type(exc).__name__}: {exc}"
        now = time.time()
        seen = self._tick_errors.get(key)

        if seen is None:
            self._tick_errors[key] = {"count": 1, "last_report": now}
            print(f"[SimLoop] Error: {key}")
            traceback.print_exc()
            return

        seen["count"] += 1
        if now - seen["last_report"] >= 60.0:
            print(f"[SimLoop] Error: {key} (x{seen['count']} in the last minute)")
            seen["count"] = 0
            seen["last_report"] = now

    def _loop(self):
        """Main simulation loop — runs in background thread."""
        dt = 1.0 / config.TICK_RATE_HZ
        
        streams = None
        visible_items = []
        tracked_objects = []

        while self.running:
            tick_start = time.time()

            try:
                if not self.paused:
                    # 1. Spawn new items
                    new_items = self.spawner.tick(dt, self.conveyor.belt_width)
                    for item in new_items:
                        self.conveyor.spawn_item(item)

                    # 2. Advance conveyor
                    events = self.conveyor.tick(dt)

                    # 3. Generate continuous sensor streams for this frame
                    visible_items = self.conveyor.get_visible_items(
                        self.conveyor.scan_zone_start - 0.5,
                        self.conveyor.scan_zone_end + 0.5,
                    )
                    
                    streams = self.sensor_provider.get_sensor_streams(
                        visible_items,
                        self.conveyor.belt_width,
                        self.conveyor.scan_zone_start,
                        config.SCAN_ZONE_LENGTH_M,
                        self.conveyor.sim_time
                    )
                    
                    # 4. Computer Vision Segmentation
                    tracked_objects = self.segmenter.process_frame(
                        streams["depth_frame"], dt, self.conveyor.speed
                    )
                    
                    # 5. Aggregate features and classify
                    for track in tracked_objects:
                        # If track center is within the NIR scan line (accounting for frame jump), aggregate NIR
                        nir_y = self.conveyor.scan_zone_start + config.SCAN_ZONE_LENGTH_M / 2
                        jump_margin = (self.conveyor.speed * dt) / 2
                        
                        if abs(track.y - nir_y) < (max(0.05, track.h) / 2 + jump_margin):
                            # Sample NIR spectrum across the object's width
                            nir_w = len(streams["nir_line"])
                            px_center = int((track.x / self.conveyor.belt_width + 0.5) * nir_w)
                            px_half_w = max(1, int((track.w / self.conveyor.belt_width) * nir_w / 2))
                            x_start = max(0, px_center - px_half_w)
                            x_end = min(nir_w, px_center + px_half_w)
                            if x_end > x_start:
                                track.nir_spectra.append(streams["nir_line"][x_start:x_end].copy())
                            
                        # Aggregate weights and inductive if in range
                        load_cell_y = self.conveyor.scan_zone_start + 0.2
                        if abs(track.y - load_cell_y) < (max(0.05, track.h) / 2 + jump_margin):
                            track.weights.append(streams["weight_kg"])
                            
                        ind_y = self.conveyor.scan_zone_start + 0.4
                        if abs(track.y - ind_y) < (max(0.05, track.h) / 2 + jump_margin):
                            track.inductive_signals.append(streams["inductive_strength"])
                            
                        # Trigger classification when it leaves the scan zone
                        if track.y > self.conveyor.scan_zone_end - 0.2 and not track.scanned:
                            # Find actual ground truth for logging/evaluation
                            gt_type = None
                            matched_item = None
                            for item in visible_items:
                                if abs(item.position_x - track.x) < 0.2 and abs(item.position_y - track.y) < 0.2:
                                    gt_type = item.item_type
                                    matched_item = item
                                    break
                                    
                            result = self.decision_engine.decide(track, ground_truth_type=gt_type)
                            track.scanned = True
                            track.decision = result["decision"]
                            
                            # Match to the physical item to divert it
                            if matched_item:
                                self.conveyor.update_item_decision(
                                    matched_item.id,
                                    decision=result["decision"],
                                    confidence=result["confidence"],
                                    hazard_type=result.get("hazard_type"),
                                    reasoning=result["reasoning"],
                                )
                                self._current_scan_data = self._serialize_scan(matched_item, track, result)

                # 6. Generate conveyor-wide sensor views for the dashboard (throttle to 10Hz)
                if streams is not None and time.time() - self._last_sensor_view_time > 0.1:
                    sensor_views = self._generate_sensor_views(tracked_objects, visible_items, streams)
                    self._last_sensor_view_time = time.time()
                else:
                    sensor_views = None

                # 6. Emit state to all connected clients
                state = self.conveyor.get_state()
                state["stats"]["throughput_per_min"] = self._measure_throughput(state["stats"])
                state["paused"] = self.paused
                state["line_config"] = self.get_line_config()
                if self.paused:
                    state["speed"] = 0.0
                state["sensor_views"] = sensor_views

                # Camera status every tick (cheap, and the page needs to know the
                # moment the hardware drops); frames only when there are new ones.
                state["camera"] = self.camera_status()
                camera_views = self._collect_camera_frames()
                if camera_views:
                    state["camera_views"] = camera_views
                state["ai_stats"] = self.decision_engine.stats.copy()
                state["ai_stats"]["accuracy"] = state["ai_stats"].get("rolling_accuracy", 1.0)
                    
                state["current_scan"] = self._current_scan_data

                self.socketio.emit("state_update", state)

            except Exception as e:
                self._log_tick_error(e)

            # Maintain tick rate
            elapsed = time.time() - tick_start
            sleep_time = max(0, dt - elapsed)
            time.sleep(sleep_time)

    def _scan_and_classify(self, item):
        """Run full sensor scan + AI classification on one item."""
        # Get sensor readings
        payload = self.sensor_provider.scan_item(
            item, self.conveyor.speed, self.conveyor.sim_time
        )

        # Run AI decision
        result = self.decision_engine.decide(payload, ground_truth_type=item.item_type)

        # Update item on conveyor
        self.conveyor.update_item_decision(
            item.id,
            decision=result["decision"],
            confidence=result["confidence"],
            hazard_type=result.get("hazard_type"),
            reasoning=result["reasoning"],
        )

        # Store current scan data for UI display
        self._current_scan_data = self._serialize_scan(item, payload, result)

    def _generate_nir_false_color(self, track) -> str:
        if not track.nir_spectra:
            return ""
        try:
            import base64
            # Find max width
            max_w = max(s.shape[0] for s in track.nir_spectra)
            
            # Pad slices to max_w
            padded_slices = []
            for s in track.nir_spectra:
                w, c = s.shape
                if w < max_w:
                    pad_w = max_w - w
                    p_left = pad_w // 2
                    p_right = pad_w - p_left
                    padded = np.pad(s, ((p_left, p_right), (0, 0)), mode='edge')
                    padded_slices.append(padded)
                else:
                    padded_slices.append(s)
                    
            cube = np.stack(padded_slices, axis=0) # shape: (H, max_w, 128)
            h, w, c = cube.shape
            
            # Map wavelengths: R=~1725nm (idx 71), G=~1400nm (idx 47), B=~1000nm (idx 18)
            r_ch = cube[:, :, min(c-1, 71)]
            g_ch = cube[:, :, min(c-1, 47)]
            b_ch = cube[:, :, min(c-1, 18)]
            
            def norm(ch):
                m = np.max(ch)
                return (ch / m * 255).astype(np.uint8) if m > 0 else np.zeros_like(ch, dtype=np.uint8)
                
            rgb = np.stack([norm(b_ch), norm(g_ch), norm(r_ch)], axis=-1) # OpenCV uses BGR
            rgb = cv2.resize(rgb, (w * 4, h * 4), interpolation=cv2.INTER_NEAREST)
            
            _, buf = cv2.imencode(".jpg", rgb, [cv2.IMWRITE_JPEG_QUALITY, 90])
            return base64.b64encode(buf.tobytes()).decode('ascii')
        except Exception as e:
            print(f"[SimLoop] Error generating NIR false color: {e}")
            return ""

    def _serialize_scan(self, item, track, result: dict) -> dict:
        """Format the scan result for the dashboard UI."""
        
        # NIR spectrum as list
        if track.nir_spectra:
            all_pixels = np.concatenate(track.nir_spectra, axis=0)
            nir_spectrum = np.mean(all_pixels, axis=0).tolist()
        else:
            nir_spectrum = [0.0] * config.NIR_CHANNELS
            
        nir_wavelengths = np.linspace(
            config.NIR_WAVELENGTH_START_NM,
            config.NIR_WAVELENGTH_END_NM,
            config.NIR_CHANNELS,
        ).tolist()
        
        return {
            "id": item.id,
            "type": item.item_type,
            "weight": round(np.max(track.weights) if track.weights else item.mass_kg, 2),
            "dimensions": f"{item.width:.2f} x {item.height:.2f} x {item.depth_extent:.2f}m",
            "volume": f"{track.volume:.4f}",
            "inductive": {
                "metal_detected": bool(np.max(track.inductive_signals) > 0.3 if track.inductive_signals else False),
                "strength": round(np.max(track.inductive_signals) if track.inductive_signals else 0.0, 3),
            },
            "capacitive": 0.0,
            "nir_spectrum": nir_spectrum,
            "nir_wavelengths": nir_wavelengths,
            "nir_section_image": self._generate_nir_false_color(track),
            "features": result["features"],
            "decision": result["decision"],
            "confidence": round(result["confidence"], 3),
            "hazard_type": result.get("hazard_type"),
            "reasoning": result["reasoning"],
            "failsafe": result["failsafe_triggered"],
        }

    def _generate_sensor_views(self, tracked_objects, visible_items, streams) -> dict:
        """Generate conveyor-wide sensor visualizations."""
        depth_frame = streams["depth_frame"]
        rgb_frame = streams["rgb_frame"]

        # Encode for transmission
        depth_img = self._depth_to_colormap(depth_frame)
        
        # Convert RGB to BGR for OpenCV drawing
        rgb_bgr = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
        
        # Draw bounding boxes on depth and rgb image
        length = config.SCAN_ZONE_LENGTH_M
        y_min = config.SCAN_ZONE_START_M
        
        for track in tracked_objects:
            px = (track.x / self.conveyor.belt_width + 0.5) * config.DEPTH_WIDTH
            py = (track.y - y_min) / length * config.DEPTH_HEIGHT
            pw = (track.w / self.conveyor.belt_width) * config.DEPTH_WIDTH
            pl = (track.h / length) * config.DEPTH_HEIGHT
            
            x1, y1 = int(px - pw / 2), int(py - pl / 2)
            x2, y2 = int(px + pw / 2), int(py + pl / 2)
            
            # Determine color based on classification if available
            color = (0, 255, 0) # Green default
            speed_str = f"{getattr(track, 'speed_ms', 0.0):.2f}m/s"
            text = f"ID:{track.track_id} {speed_str}"
            is_misclassified = False
            
            if track.decision:
                is_hazard_pred = (track.decision == "HAZARD")
                
                # Check ground truth
                is_hazard_true = False
                found_gt = False
                for item in visible_items:
                    if abs(item.position_x - track.x) < 0.2 and abs(item.position_y - track.y) < 0.2:
                        from sensors.item_models import MATERIAL_TABLE
                        mat = MATERIAL_TABLE.get(item.item_type)
                        is_hazard_true = mat.is_hazard if mat else False
                        found_gt = True
                        break
                        
                if not found_gt:
                    color = (0, 0, 255) # RED for ghost
                    text = f"GHOST {speed_str}"
                    is_misclassified = True
                elif is_hazard_pred != is_hazard_true:
                    color = (0, 0, 255) # RED for misclassified
                    text = f"MISDETECT {speed_str}"
                    is_misclassified = True
                elif is_hazard_pred:
                    color = (0, 140, 255) # Orange for correct hazard
            elif track.scanned:
                color = (0, 165, 255) # Orange for processing
            
            # Draw on Depth
            cv2.rectangle(depth_img, (x1, y1), (x2, y2), color, 2)
            cv2.putText(depth_img, text, (x1, max(10, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
            
            # Draw on RGB
            cv2.rectangle(rgb_bgr, (x1, y1), (x2, y2), color, 2)
            cv2.putText(rgb_bgr, text, (x1, max(10, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        _, depth_buf = cv2.imencode(".jpg", depth_img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        _, rgb_buf = cv2.imencode(".jpg", rgb_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])

        # Generate Full Point Cloud and Boxes for Three.js
        h, w = depth_frame.shape
        valid = depth_frame > 10.0
        u, v = np.meshgrid(np.arange(w), np.arange(h))
        u = u[valid]
        v = v[valid]
        z_mm = depth_frame[valid]
        
        # Approximate global coordinates centered around the scan zone
        y_center = config.SCAN_ZONE_START_M + config.SCAN_ZONE_LENGTH_M / 2
        x_m = (u / w - 0.5) * self.conveyor.belt_width
        y_m = (v / h) * length + y_min - y_center  # center at 0
        z_m = z_mm / 1000.0
        
        pc = np.stack([x_m, y_m, z_m], axis=-1)
        if len(pc) > 6000:
            indices = np.random.choice(len(pc), 6000, replace=False)
            pc = pc[indices]
            
        baseline_z = config.DEPTH_BASELINE_MM / 1000.0
        heights = baseline_z - pc[:, 2]
        
        # Round to 3 decimals to massively optimize JSON serialization speed and size
        pc = np.round(pc, 3)
        heights = np.round(heights, 3)
        
        boxes = []
        for track in tracked_objects:
            color = "#00ff00"  # default green (safe)
            is_misclassified = False
            
            if track.decision:
                is_hazard_pred = (track.decision == "HAZARD")
                
                # Check ground truth
                is_hazard_true = False
                for item in visible_items:
                    if abs(item.position_x - track.x) < 0.2 and abs(item.position_y - track.y) < 0.2:
                        from sensors.item_models import MATERIAL_TABLE
                        mat = MATERIAL_TABLE.get(item.item_type)
                        is_hazard_true = mat.is_hazard if mat else False
                        break
                        
                if is_hazard_pred != is_hazard_true:
                    color = "#ff0000"  # RED for misclassified
                    is_misclassified = True
                elif is_hazard_pred:
                    color = "#ff8c00"  # Orange for hazard
            elif track.scanned:
                color = "#ffaa00"  # Orange for processing
                
            boxes.append({
                "id": f"track_{track.track_id}",
                "x": track.x,
                "y": track.y - y_center,
                "z": 0.1,  # base height
                "w": track.w,
                "l": track.h,
                "h": 0.1,  # use generic box height as volume varies
                "color": color,
                "is_misclassified": is_misclassified
            })

        result = {
            "depth_image": base64.b64encode(depth_buf).decode("ascii"),
            "rgb_image": base64.b64encode(rgb_buf).decode("ascii"),
            "point_cloud": {
                "positions": pc.tolist(),
                "heights": heights.tolist(),
                "boxes": boxes
            }
        }
        
        return result

    @staticmethod
    def _depth_to_colormap(depth_frame: np.ndarray) -> np.ndarray:
        """Convert depth frame to a color-mapped image for display."""
        # Normalize to 0-255
        d_min = float(max(depth_frame[depth_frame > 0].min(), 400)) if (depth_frame > 0).any() else 400.0
        d_max = float(config.DEPTH_BASELINE_MM + 50)
        normalized = np.clip(
            (depth_frame.astype(np.float32) - d_min) / (d_max - d_min) * 255.0,
            0, 255
        ).astype(np.uint8)
        # Apply TURBO colormap (depth visualization standard)
        colored = cv2.applyColorMap(normalized, cv2.COLORMAP_TURBO)
        # Dead pixels (depth=0) → black
        colored[depth_frame == 0] = [0, 0, 0]
        return colored

    @staticmethod
    def _nir_section_to_colormap(section: np.ndarray) -> np.ndarray:
        """Convert NIR section map to a heatmap image."""
        if section.size == 0:
            return np.zeros((10, 128, 3), dtype=np.uint8)
        # Normalize
        normalized = np.clip(section * 255, 0, 255).astype(np.uint8)
        # Resize for better visibility
        if normalized.shape[0] < 32:
            normalized = cv2.resize(normalized, (128, 64), interpolation=cv2.INTER_NEAREST)
        colored = cv2.applyColorMap(normalized, cv2.COLORMAP_INFERNO)
        return colored
