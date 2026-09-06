import cv2
import threading
import time
from typing import Optional
from datetime import datetime

from app.core.config import SNAPSHOTS_DIR
from app.vision.detector import detector
from app.vision.frame_clock import FrameClock
from app.vision.timestamp_regions import timestamp_regions


class CameraManager:
    def __init__(self):
        self.cap: Optional[cv2.VideoCapture] = None

        self.connected = False
        self.running = False

        self.frame = None

        # The source's own position for the frame in the slot, in seconds —
        # None for live devices, which have no position. Stored beside the
        # frame under the same lock because a position without its frame is
        # a different moment's answer.
        self.frame_pos = None

        self.frame_lock = threading.Lock()

        self.source = None

        self.fps = 0
        self.frame_count = 0
        self.last_fps_time = time.time()

        self.current_source = None

        # Handle to the capture thread, so stop() can wait for it to finish
        # before releasing the capture it is reading from.
        self.capture_thread = None

        # Survives stop(), so starting again resumes the source the operator
        # last chose rather than silently reverting to the built-in webcam.
        self.last_source = None

        # This source's burned-in clock, read so events can carry the
        # recording's own time. One per source, living exactly as long as
        # the capture does: created in start(), dropped in stop(), which the
        # source-change and upload routes already call.
        self.frame_clock: Optional[FrameClock] = None

    def start(self, source=0):
        """
        Starts camera capture.
        source can be:
            0
            1
            RTSP URL
            Video file
        """

        if self.running:
            return True

        self.source = source

        self.cap = cv2.VideoCapture(source)

        if not self.cap.isOpened():
            print(f"[Camera] Unable to open source: {source}")
            self.connected = False
            return False

        self.connected = True
        self.running = True
        self.current_source = source
        self.last_source = source

        self.frame_clock = FrameClock(
            source_key=str(source),
            roi=timestamp_regions.get(source),
        )
        # Attached so a mark saved while this capture runs re-arms the
        # clock immediately, and so the status route can list it.
        timestamp_regions.attach(source, self.frame_clock)

        # Detect source FPS
        self.video_fps = self.cap.get(cv2.CAP_PROP_FPS)

        if self.video_fps <= 0 or self.video_fps > 120:
            self.video_fps = 30

        self.capture_thread = threading.Thread(
            target=self._capture_loop,
            daemon=True,
        )

        self.capture_thread.start()

        print("[Camera] Started")

        return True

    def _capture_loop(self):

        frame_delay = 1.0 / self.video_fps

        while self.running:

            start_time = time.time()

            success, frame = self.cap.read()

            if not success:

                # Loop uploaded videos
                if isinstance(self.source, str):
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                self.connected = False
                print("[Camera] Lost connection")
                break

            # The source's own position for this exact frame. Local device
            # indexes report 0 and some RTSP stacks report garbage, so
            # anything that is not a positive finite number is honestly "no
            # position" — the frame clock then anchors by wall time instead.
            pos_ms = self.cap.get(cv2.CAP_PROP_POS_MSEC)
            pos = (
                pos_ms / 1000.0
                if isinstance(pos_ms, float) and 0.0 < pos_ms < float("inf")
                else None
            )

            with self.frame_lock:
                self.frame = frame
                self.frame_pos = pos

            self.frame_count += 1

            now = time.time()

            if now - self.last_fps_time >= 1:

                self.fps = self.frame_count

                self.frame_count = 0

                self.last_fps_time = now

            # Maintain uploaded video speed
            if isinstance(self.source, str):

                elapsed = time.time() - start_time

                remaining = frame_delay - elapsed

                if remaining > 0:
                    time.sleep(remaining)

        self.running = False

    def get_frame(self):

        with self.frame_lock:

            if self.frame is None:
                return None

            return self.frame.copy()

    def get_frame_with_pos(self):
        """
        The frame and the source position it was read at, together.

        A separate accessor rather than a change to get_frame(): the other
        callers — freeze-frame, snapshots, the plain stream — neither need
        the position nor should be reshaped by it.
        """

        with self.frame_lock:

            if self.frame is None:
                return None, None

            return self.frame.copy(), self.frame_pos

    def get_status(self):

        return {
            "connected": self.running,
            "fps": self.fps,
            "source": self.current_source,
        }

    def stop(self):
        """
        Stop capture and release the source.

        The capture thread is joined before the capture is released. Releasing
        it while a read is still in flight makes FFmpeg abort the process with
        "Assertion fctx->async_lock failed", which took down the whole backend
        whenever the camera source was switched.
        """

        print("STOP CALLED")

        self.running = False

        thread = self.capture_thread

        if thread is not None and thread.is_alive():

            # Bounded so a wedged read cannot hang shutdown. Worst case we
            # fall through to release() and are no worse off than before.
            thread.join(timeout=5)

            if thread.is_alive():
                print("[Camera] Capture thread did not stop within 5s")

        self.capture_thread = None

        self.connected = False
        self.current_source = None
        self.frame = None
        self.frame_pos = None

        # The clock belongs to the source; the next start() builds a fresh
        # one rather than letting a new video inherit an old anchor. Its
        # own source_key is the detach key — current_source is already
        # gone by this line.
        if self.frame_clock is not None:
            timestamp_regions.detach(
                self.frame_clock.source_key, self.frame_clock
            )
        self.frame_clock = None

        # Zeroed, or the last rate stays on the status endpoint after the
        # camera is gone and reads as a camera still delivering frames.
        self.fps = 0
        self.frame_count = 0

        if self.cap:
            self.cap.release()

        self.cap = None

        print("[Camera] Stopped")

    def save_snapshot(self):

        frame = self.get_frame()

        if frame is None:
            return None

        today = datetime.now().strftime("%Y-%m-%d")

        snapshot_folder = SNAPSHOTS_DIR / today
        snapshot_folder.mkdir(parents=True, exist_ok=True)

        filename = f"snapshot_{datetime.now():%H-%M-%S}.jpg"

        filepath = snapshot_folder / filename

        cv2.imwrite(str(filepath), frame)

        return {
            "filename": filename,
            "path": str(filepath),
        }


#: Widest the live view is sent at.
#:
#: A plant camera may be 1280x720 or larger, but the picture is shown in a
#: panel a few hundred pixels wide, so sending it at full size spends the
#: link on detail that is scaled away before anyone sees it. Measured on the
#: test footage: 215 KB a frame at full size and quality, 48 KB at this.
#:
#: Applied after analysis, never before — the model still sees every pixel the
#: camera captured, so what is detected does not change with this number.
STREAM_WIDTH = 960

#: Quality of each streamed frame.
#:
#: High enough that an operator cannot tell at monitoring distance, low enough
#: that the link is not the thing limiting the frame rate.
STREAM_QUALITY = 60

#: Frames a second sent to a browser.
#:
#: Without a cap this loop runs as fast as the model does. On a GPU that is
#: 30-plus frames a second of JPEG — around 50 Mbps — which no remote link
#: will carry. The excess does not vanish; it fills the buffers between here
#: and the browser, and the operator ends up watching a picture that is
#: seconds behind what the camera is pointed at.
#:
#: 12 is comfortably smooth for watching a room, and roughly 4.6 Mbps at the
#: size and quality above.
STREAM_FPS = 12


def generate_frames(camera_manager, service=None):
    """
    MJPEG frame generator.

    Paced and downscaled deliberately: see STREAM_FPS above for why sending
    everything as fast as it can be produced makes the picture later, not
    smoother.

    Args:
        camera_manager: source of frames.
        service: monitoring module to analyse each frame with. When omitted the
            frames go through the restricted-zone detector directly, which is
            the behaviour the /camera/stream endpoint has always had.
    """

    print(">>>>>>>> STREAM STARTED")

    interval = 1.0 / STREAM_FPS
    next_frame_at = time.perf_counter()

    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_QUALITY]

    # Whether this watcher's clock has ever answered. The first answer
    # re-stamps the events the hunt seconds opened onto the recording's
    # own clock — the violation was on it all along, the reader just had
    # not confirmed it yet.
    clock_answered = False

    # The last camera-clock verdict pushed to the register, so the register
    # hears changes, never a verdict per frame.
    clock_reported = None

    while camera_manager.running:

        # Wait first, then take the picture. The other way round would send a
        # frame that had been sitting around for the length of the wait.
        wait = next_frame_at - time.perf_counter()
        if wait > 0:
            time.sleep(wait)

        next_frame_at = time.perf_counter() + interval

        frame, frame_pos = camera_manager.get_frame_with_pos()

        if frame is None:
            time.sleep(0.01)
            continue

        if service is None:
            frame = detector.process(frame)
        else:
            # The burned-in clock reads the raw frame, before analysis
            # paints boxes that could land on the overlay. Two watchers on
            # one source share the manager's clock; the sampling gate makes
            # the second feeder's call a couple of float compares.
            clock = camera_manager.frame_clock
            resolved = None
            if clock is not None:
                clock.observe_frame(frame, frame_pos)
                resolved = clock.resolve(frame_pos)

            # Before the module judges, for the same reason as the socket
            # path: a verdict that turns on the hour must be reached
            # against the hour the footage says it is.
            service.observed_clock = resolved

            from app.events import event_store

            if resolved is not None and not clock_answered:
                clock_answered = True
                event_store.restamp_open(service.module_id, resolved)

            # The clock verdict for the event record, and — on change only —
            # for the register of the camera this source belongs to. An
            # uploaded recording belongs to no registered camera and reports
            # to nobody; its events still carry the verdict.
            clock_verdict = (
                clock.clock_status() if clock is not None else None
            )
            if clock is not None and clock_verdict != clock_reported:
                clock_reported = clock_verdict
                from app.camera.registry import camera_registry

                camera_id = camera_registry.camera_for_source(
                    camera_manager.current_source
                )
                if camera_id:
                    camera_registry.report_clock(
                        camera_id,
                        clock_verdict,
                        last_read=clock.status().get("last_read"),
                    )

            frame, result = service.process(frame)

            # Recorded before the picture is shrunk for sending, so the
            # evidence keeps the detail the analysis was actually made on.
            event_store.observe(
                service.module_id, service.events(result), frame,
                resolved=resolved, clock_status=clock_verdict,
            )

        height, width = frame.shape[:2]

        if width > STREAM_WIDTH:
            scale = STREAM_WIDTH / width
            frame = cv2.resize(
                frame,
                (STREAM_WIDTH, int(height * scale)),
                interpolation=cv2.INTER_AREA,
            )

        success, buffer = cv2.imencode(".jpg", frame, encode_params)

        if not success:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )

    print("<<<<<<<< STREAM CLOSED")