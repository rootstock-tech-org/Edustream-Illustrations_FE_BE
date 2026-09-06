"""
Count of cameras arriving through browsers.

The camera manager knows about exactly one camera: the one this process
captures itself. But most cameras reach the system another way — a browser
captures its own device and pushes frames over a module's WebSocket. The
dashboard used to count only the first kind, so an operator watching through
their phone read "Cameras connected: 0" beside a live picture, which is the
sort of contradiction that teaches people to stop believing the screen.

One connected socket is one camera. That is an approximation — two tabs on
one laptop count as two — but it errs on the side of describing what is
actually feeding the system, and each socket genuinely is a separate stream
being analysed.

The count is kept per module as well as in total, because a socket ending is
the only moment the system learns that a module's camera has gone. An event
is otherwise only ever closed by a later frame showing the problem gone, and
after the last socket there are no later frames: events opened from a browser
camera stayed open for ever. A five-minute test recording from days ago read
as an ongoing unresolved hazard on the Events page and in every export, and
"still open" meant nothing more than that nobody had looked since.
"""

import threading
from contextvars import ContextVar
from typing import Optional

#: Which module the socket being served on this task is feeding.
#:
#: The socket handler is built by the module router factory and counts itself
#: as a camera without saying whose camera it is; main.py wraps each module's
#: socket route to set this for the length of the connection. A context
#: variable rather than an argument because the count is reached through a
#: module-global, and every connection runs in its own asyncio task, so one
#: socket can never read another's value.
socket_module: ContextVar[Optional[str]] = ContextVar(
    "browser_socket_module", default=None
)


def feeding_module(asgi_app, module_id: str):
    """
    Wrap a module's WebSocket route so its sockets say which module they feed.

    Args:
        asgi_app: the route's ASGI application.
        module_id: the module the route belongs to.
    """

    async def named_socket(scope, receive, send):
        token = socket_module.set(module_id)

        try:
            await asgi_app(scope, receive, send)
        finally:
            socket_module.reset(token)

    return named_socket


class BrowserStreams:
    """Thread-safe count of open browser-camera sockets, in total and by module."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._count = 0

        # Sockets per module. Only modules with a live socket appear, so this
        # does not grow with the number of modules ever watched.
        self._by_module: dict[str, int] = {}

    def connected(self, module_id: Optional[str] = None) -> None:
        module_id = module_id or socket_module.get()

        with self._lock:
            self._count += 1

            if module_id:
                self._by_module[module_id] = self._by_module.get(module_id, 0) + 1

    def disconnected(self, module_id: Optional[str] = None) -> None:
        """
        One browser camera has gone.

        When it was the last one watching its module, that module's open
        events are ended here — this is the only moment anything knows the
        camera that was reporting them has stopped reporting. Per module, and
        only on the last socket: a second browser closing its tab must not
        end events the first one is still feeding, and a browser leaving one
        module says nothing about the modules it was never watching.
        """
        module_id = module_id or socket_module.get()
        was_the_last = False

        with self._lock:
            # Never below zero: a double-disconnect must not make the
            # dashboard owe cameras.
            self._count = max(0, self._count - 1)

            if module_id:
                remaining = max(0, self._by_module.get(module_id, 0) - 1)

                if remaining:
                    self._by_module[module_id] = remaining
                else:
                    self._by_module.pop(module_id, None)
                    was_the_last = True

        # The register's live context follows the sockets: when the last
        # browser camera for the whole process has gone, whatever camera was
        # feeding analysis is feeding nothing now — offline, never forgotten.
        if self._count == 0:
            try:
                from app.camera.registry import camera_registry

                camera_registry.clear_context()
            except Exception:  # noqa: BLE001
                pass

        # Outside the lock: closing events writes to the database, and
        # /system/status reads this count on every dashboard poll — it must
        # not queue behind disk I/O.
        if was_the_last:
            self._close_events(module_id)

    def watching(self, module_id: str) -> int:
        """How many browser cameras are feeding one module right now."""
        with self._lock:
            return self._by_module.get(module_id, 0)

    @staticmethod
    def _close_events(module_id: str) -> None:
        """
        End what that module had open, now that nothing is watching it.

        Imported here rather than at module scope because app.events is free
        to import the camera package. Failures are reported and stepped over:
        a socket closing must not raise, and an event left open is a wrong
        record rather than a broken server.
        """
        try:
            from app.events import event_store

            event_store.forget_open(module_id)
        except Exception as exc:  # noqa: BLE001
            print(f"[Camera] Could not close open {module_id} events: {exc}")

    @property
    def count(self) -> int:
        with self._lock:
            return self._count


browser_streams = BrowserStreams()
