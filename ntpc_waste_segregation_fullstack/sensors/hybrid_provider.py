import numpy as np
import time
import threading
import cv2

from sensors.sensor_interface import SensorProvider
from sensors.item_models import WasteItem, SensorPayload
import config

try:
    import pyrealsense2 as rs
except ImportError:
    rs = None

# We inherit from MockSensorProvider because we want to reuse all the mocking logic
# for NIR, Load Cell, and Inductive sensors. We only override the Depth/RGB methods.
from sensors.mock_provider import MockSensorProvider


class HybridSensorProvider(MockSensorProvider):
    """
    Hybrid hardware sensor provider.
    
    The simulation pipeline ALWAYS uses mock-generated depth/RGB for the AI
    (segmenter, classification). This ensures the simulation works identically
    regardless of whether a physical camera is connected.
    
    When the Intel RealSense D435i is available, we capture its RGB feed in a
    background thread and expose it via `get_camera_frame()` for the /camera
    page to display live annotations overlaid on the real-world view.
    """

    def __init__(self):
        super().__init__()
        self.pipeline = None
        self.align = None
        self.camera_ready = False
        # Last camera failure, surfaced to /camera. None once streaming again.
        self.camera_error: str | None = None
        self._frame_error_reported = 0.0
        
        # Latest real camera frames (grabbed by background thread)
        self._camera_lock = threading.Lock()
        self._last_camera_rgb = None
        self._last_camera_depth_colormap = None
        self._camera_thread = None
        self._camera_running = False
        
        # Physical camera tracking state
        self._bg_subtractor = cv2.createBackgroundSubtractorKNN(history=100, dist2Threshold=50, detectShadows=False)
        self._phys_tracks = {}
        self._phys_next_id = 1
        self._last_frame_time = 0.0

    def initialize(self) -> None:
        """Open camera connection and initialize mock systems."""
        super().initialize()
        
        if rs is None:
            self.camera_error = (
                "pyrealsense2 is not installed — install requirements-hardware.txt "
                "on a machine with the RealSense SDK to enable the live feed."
            )
            print("[HybridSensorProvider] pyrealsense2 not installed. Camera disabled.")
            return
        
        # Clean up any existing pipeline before reinitializing
        self._stop_pipeline()
            
        print("[HybridSensorProvider] Starting Intel RealSense D435i pipeline...")
        self.pipeline = rs.pipeline()
        cfg = rs.config()
        
        # Request standard resolution
        cfg.enable_stream(rs.stream.depth, config.DEPTH_WIDTH, config.DEPTH_HEIGHT, rs.format.z16, config.DEPTH_FPS)
        cfg.enable_stream(rs.stream.color, config.RGB_WIDTH, config.RGB_HEIGHT, rs.format.bgr8, config.DEPTH_FPS)
        
        try:
            self.pipeline.start(cfg)
            self.align = rs.align(rs.stream.color)
            self.camera_ready = True
            self.camera_error = None
            print("[HybridSensorProvider] D435i Camera Started successfully.")
            
            # Start background capture thread
            self._camera_running = True
            self._last_frame_time = time.time()
            self._camera_thread = threading.Thread(target=self._camera_capture_loop, daemon=True)
            self._camera_thread.start()
        except Exception as e:
            self.camera_ready = False
            self.pipeline = None
            self.camera_error = f"Camera did not start: {e}"
            print(f"[HybridSensorProvider] Camera not detected or failed to start: {e}. Camera disabled.")

    def _camera_capture_loop(self):
        """Background thread that continuously grabs frames from the real camera and tracks objects."""
        while self._camera_running and self.camera_ready:
            try:
                frames = self.pipeline.wait_for_frames(timeout_ms=1000)
                now = time.time()
                dt = max(0.001, now - self._last_frame_time)
                self._last_frame_time = now
                
                aligned_frames = self.align.process(frames)
                depth_frame_rs = aligned_frames.get_depth_frame()
                color_frame_rs = aligned_frames.get_color_frame()
                
                if depth_frame_rs and color_frame_rs:
                    depth_raw = np.asanyarray(depth_frame_rs.get_data()).copy()
                    color_raw = np.asanyarray(color_frame_rs.get_data()).copy()
                    rgb = cv2.cvtColor(color_raw, cv2.COLOR_BGR2RGB)
                    
                    # Create Depth colormap
                    # Normalize depth to 8-bit for display and background subtraction
                    d_min, d_max = 400.0, 1500.0  # Assumed operating range for physical camera (mm)
                    depth_8u = np.clip((depth_raw - d_min) / (d_max - d_min) * 255.0, 0, 255).astype(np.uint8)
                    depth_colormap = cv2.applyColorMap(depth_8u, cv2.COLORMAP_TURBO)
                    depth_colormap[depth_raw == 0] = [0, 0, 0]  # Dead pixels
                    
                    # 1. Background Subtraction to find moving objects
                    fg_mask = self._bg_subtractor.apply(depth_8u)
                    
                    # Cleanup mask
                    kernel = np.ones((5,5), np.uint8)
                    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
                    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
                    
                    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    current_detections = []
                    for cnt in contours:
                        if cv2.contourArea(cnt) > 800:  # Minimum pixel area for a physical object
                            x, y, w, h = cv2.boundingRect(cnt)
                            cx, cy = x + w/2, y + h/2
                            current_detections.append({'x': x, 'y': y, 'w': w, 'h': h, 'cx': cx, 'cy': cy})
                            
                    # 2. Tracking (Greedy distance matching)
                    matched = set()
                    
                    # Convert to list to modify during iteration
                    for t_id, track in list(self._phys_tracks.items()):
                        track['last_seen'] += dt
                        
                    for det in current_detections:
                        best_id = None
                        best_dist = float('inf')
                        for t_id, track in self._phys_tracks.items():
                            if t_id in matched: continue
                            dist = np.hypot(det['cx'] - track['cx'], det['cy'] - track['cy'])
                            if dist < 100 and dist < best_dist:  # Max 100px jump between frames
                                best_dist = dist
                                best_id = t_id
                        
                        if best_id is not None:
                            t = self._phys_tracks[best_id]
                            # Speed calculation in pixels/sec
                            inst_speed_y = (det['cy'] - t['cy']) / dt
                            t['speed_y'] = t['speed_y'] * 0.7 + inst_speed_y * 0.3
                            
                            t['cx'], t['cy'] = det['cx'], det['cy']
                            t['x'], t['y'] = det['x'], det['y']
                            t['w'], t['h'] = det['w'], det['h']
                            t['last_seen'] = 0.0
                            matched.add(best_id)
                        else:
                            # New track
                            self._phys_tracks[self._phys_next_id] = {
                                'x': det['x'], 'y': det['y'], 'w': det['w'], 'h': det['h'],
                                'cx': det['cx'], 'cy': det['cy'],
                                'speed_y': 0.0, 'last_seen': 0.0
                            }
                            self._phys_next_id += 1
                            
                    # Remove lost tracks
                    self._phys_tracks = {k: v for k, v in self._phys_tracks.items() if v['last_seen'] < 0.5}
                    
                    # 3. Draw annotations on both RGB and Depth Colormap
                    for t_id, t in self._phys_tracks.items():
                        color = (0, 255, 255)  # Yellow for physical detection
                        pt1 = (int(t['x']), int(t['y']))
                        pt2 = (int(t['x'] + t['w']), int(t['y'] + t['h']))
                        
                        # Very rough estimation: 1 px ≈ 2mm at this distance
                        speed_ms = abs(t['speed_y']) * 0.002
                        text = f"OBJ_{t_id} | {speed_ms:.2f}m/s"
                        
                        # Draw on RGB
                        cv2.rectangle(rgb, pt1, pt2, color, 2)
                        cv2.putText(rgb, text, (pt1[0], max(15, pt1[1]-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                        
                        # Draw on Depth
                        cv2.rectangle(depth_colormap, pt1, pt2, color, 2)
                        cv2.putText(depth_colormap, text, (pt1[0], max(15, pt1[1]-5)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
                    
                    with self._camera_lock:
                        self._last_camera_rgb = rgb
                        self._last_camera_depth_colormap = depth_colormap
                    self.camera_error = None   # a good frame clears a transient fault
            except RuntimeError as e:
                # Device unplugged or the pipeline died — not recoverable in place.
                print(f"[HybridSensorProvider] Camera lost: {e}. Camera disabled.")
                self.camera_error = f"Camera lost: {e}. Use Reconnect Sensor to retry."
                self.camera_ready = False
                break
            except Exception as e:
                # Transient — keep trying, but record it so a feed that is quietly
                # failing every frame is visible instead of looking merely idle.
                # Printing is throttled: this loop runs at the camera's frame rate.
                self.camera_error = f"Frame capture failed: {e}"
                now = time.time()
                if now - self._frame_error_reported > 30.0:
                    print(f"[HybridSensorProvider] Frame capture failing: {e}")
                    self._frame_error_reported = now

    def get_camera_frame(self):
        """
        Get the latest real camera RGB frame and annotated Depth colormap.
        Returns (rgb_frame, depth_colormap) or (None, None) if no camera.
        """
        with self._camera_lock:
            return self._last_camera_rgb, self._last_camera_depth_colormap

    def _stop_pipeline(self):
        """Safely stop the RealSense pipeline if it exists."""
        self._camera_running = False
        if self._camera_thread is not None:
            self._camera_thread.join(timeout=2.0)
            self._camera_thread = None
        if self.pipeline is not None:
            try:
                self.pipeline.stop()
            except Exception:
                pass  # Pipeline may already be stopped or device disconnected
            self.pipeline = None
        self.camera_ready = False
        with self._camera_lock:
            self._last_camera_rgb = None
            self._last_camera_depth_colormap = None
        # Deliberately not clearing camera_error: initialize() sets it on the next
        # attempt, and until then the page should still show why the feed stopped.

    def shutdown(self) -> None:
        """Close connections."""
        self._stop_pipeline()
        super().shutdown()

    # NOTE: We do NOT override get_conveyor_depth_frame anymore.
    # The simulation pipeline always uses MockSensorProvider's depth/RGB generation.
    # The real camera feed is accessed independently via get_camera_frame().
