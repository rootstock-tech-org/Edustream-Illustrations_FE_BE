"""
Server-side audible alarm.

Beeps on the machine running the service, which is only useful when that
machine is in the room — a plant PC with speakers beside the operator. It is
not the main alert: when the service runs on a server, or on Colab, nobody is
near that speaker. The alert the operator actually hears is played in the
browser (see the frontend's useAlertSound), which works wherever the service
happens to be.
"""

import threading
import time

try:
    import winsound
except ImportError:
    # winsound is Windows-only. Elsewhere the state is logged and no tone is
    # produced; the browser is where the operator is told.
    winsound = None


class AlarmManager:

    def __init__(self):
        self.running = False
        self.thread = None

    def _beep_loop(self):
        """
        Continuously beep until stopped.
        """

        print("[Alarm] Started")

        while self.running:
            winsound.Beep(
                2000,   # Frequency (Hz)
                500,    # Duration (ms)
            )

            time.sleep(0.2)

        print("[Alarm] Stopped")

    def start(self):
        """
        Start alarm only if not already running.
        """

        if self.running:
            return

        self.running = True

        if winsound is None:
            # No speaker to reach from here. Recording the state without
            # spawning a thread that would only sleep in a loop.
            print("[Alarm] Alert raised (no audio on this platform)")
            return

        self.thread = threading.Thread(
            target=self._beep_loop,
            daemon=True,
        )

        self.thread.start()

    def stop(self):
        """
        Stop alarm.
        """

        self.running = False


alarm = AlarmManager()