import platform
import time

import psutil

from app.camera import camera_manager

# Response keys are unchanged so existing consumers keep working. What changed
# is that the values are now measured rather than hardcoded: this endpoint
# previously reported database=True with no database, model.loaded=False with
# the model loaded, occupancy.people=0 always, and alarm=False even while an
# intrusion was being detected. A dashboard is only as truthful as its source.


class SystemService:
    def __init__(self):
        self.start_time = time.time()

    def uptime(self):
        seconds = int(time.time() - self.start_time)

        hrs = seconds // 3600
        mins = (seconds % 3600) // 60
        secs = seconds % 60

        return f"{hrs:02}:{mins:02}:{secs:02}"

    def _modules(self):
        """
        Aggregate live state across every registered monitoring module.

        Imported lazily: app.modules imports the services, which import the
        detector, so importing it at module scope would create a cycle.
        """
        try:
            from app.modules import registry
        except ImportError:
            return {"total": 0, "ready": 0, "watching": 0, "alerting": 0, "alarm": False}

        services = registry.list_services()

        ready = 0
        watching = 0
        alerting = 0

        for service in services:
            try:
                if service.is_ready():
                    ready += 1

                watching_now = service.is_watching()

                if watching_now:
                    watching += 1

                # Only from a module that is still watching. An alert is the
                # last thing a module saw, and it stays on the module after
                # the camera stops — so without this the alarm light stays lit
                # over a dead camera, which is worse than no alarm light.
                if watching_now and service.get_results().get("alert"):
                    alerting += 1
            except Exception:  # noqa: BLE001
                # One misbehaving module must not take the status endpoint
                # down — that is the one call the dashboard always makes.
                continue

        return {
            "total": len(services),
            # Set up and able to watch.
            "ready": ready,
            # Actually receiving frames. The two are not the same, and the
            # dashboard was showing the first under the word "watching".
            "watching": watching,
            "alerting": alerting,
            "alarm": alerting > 0,
        }

    def _model(self):
        """Whether the detection model is loaded, and on what."""
        try:
            from app.vision.detector import detector

            device = "CPU"

            try:
                import torch

                if torch.cuda.is_available():
                    device = "GPU"
            except ImportError:
                pass

            # No inference_ms here. It was hardcoded to 0, which reads as
            # "instant" rather than "not measured", and nothing displays it.
            # Better absent than confidently wrong.
            return {
                "loaded": detector.model is not None,
                "name": "YOLOv8n-seg",
                "device": device,
            }
        except Exception:  # noqa: BLE001
            return {"loaded": False, "name": None, "device": "CPU"}

    @staticmethod
    def _occupancy():
        """
        People seen in the most recent analysed frame, by whichever module
        actually analysed it.

        This used to read the restricted-zone detector directly, which was
        wrong twice over. Watching any other module left it reporting zero
        with people plainly on screen, because nothing else writes to that
        detector. And stopping the camera left the last number sitting there
        for ever — the dashboard would show people in view beside "no camera
        connected", which is the sort of thing that teaches an operator to
        stop believing the screen.

        Now it takes the freshest result from a module that is still watching,
        and reports nobody when none of them are.
        """
        try:
            from app.modules import registry
        except ImportError:
            return {"people": 0, "in_restricted_area": 0, "active_zone": None, "measured": False}

        freshest = None

        for service in registry.list_services():
            try:
                if not service.is_watching():
                    continue

                result = service.get_results()

                # Only modules that count people can answer this.
                if "people_total" not in result:
                    continue

                age = service.seconds_since_result()

                if freshest is None or age < freshest[0]:
                    freshest = (age, result)
            except Exception:  # noqa: BLE001
                # One misbehaving module must not take the status endpoint
                # down — that is the one call the dashboard always makes.
                continue

        if freshest is None:
            return {
                "people": 0,
                "in_restricted_area": 0,
                "active_zone": None,
                # Says "nobody is looking", as distinct from "nobody is there".
                "measured": False,
            }

        result = freshest[1]
        inside = result.get("people_inside", 0)

        return {
            "people": result.get("people_total", 0),
            "in_restricted_area": inside,
            "active_zone": "Restricted area" if inside else None,
            "measured": True,
        }

    @staticmethod
    def _cameras():
        """
        Every camera feeding the system, not just the one this process holds.

        Frames arrive two ways: the server capturing a camera itself, and
        browsers pushing their own cameras over module sockets. The dashboard
        used to count only the first, so an operator watching through their
        phone read "Cameras connected: 0" beside a live picture.
        """
        status = camera_manager.get_status()

        try:
            from app.camera.browser_streams import browser_streams

            streams = browser_streams.count
        except ImportError:
            streams = 0

        status["browser_streams"] = streams
        status["total"] = (1 if status.get("connected") else 0) + streams

        return status

    @staticmethod
    def _events_reachable() -> bool:
        """
        Whether the event history can actually be read right now.

        Cheapest question that proves the whole path works: the file opens,
        the schema is there, and a query returns. A missing disk or a
        corrupted database shows up here rather than the first time an
        operator opens the reports page.
        """
        try:
            from app.events import event_store

            event_store.list(limit=1)
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"[System] Event history unreachable: {exc}")
            return False

    def get_status(self):
        modules = self._modules()

        return {
            "backend": True,

            # Answered by asking the store, not by asserting it. A health
            # check that reports what the code intends rather than what it
            # can actually do is worse than no health check — it is the one
            # thing on the screen that must never be optimistic.
            "database": self._events_reachable(),

            "camera": self._cameras(),

            "monitoring": modules,

            "model": self._model(),

            "system": {
                "cpu": round(psutil.cpu_percent(), 1),
                "memory": round(psutil.virtual_memory().percent, 1),
                # No "gpu" key. It was hardcoded to 0, which is
                # indistinguishable from a genuinely idle GPU.
                "uptime": self.uptime(),
                "platform": platform.system(),
            },

            "occupancy": self._occupancy(),

            "alarm": modules["alarm"],

            "version": "1.0.0",
        }


system_service = SystemService()
