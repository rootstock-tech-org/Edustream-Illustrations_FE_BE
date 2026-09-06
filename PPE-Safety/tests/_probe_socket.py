"""
The same empty-buffer hole, on the other endpoint that decodes bytes.

The photo endpoint and the browser-camera socket both hand raw bytes to
`cv2.imdecode`, and both had the same guard — `if frame is None` — that the
assertion on an empty buffer jumps straight over. The difference is what it
costs: on the socket the assertion escapes to the handler at the bottom of
the loop, which answers with the raw OpenCV message and then *closes the
socket*, so one dropped frame from a browser camera ends the session.

The frames sent here are, in order:

    an empty frame        must be answered and the socket must survive
    a real photograph     must still be analysed, on the same socket
    a non-image           must be answered and the socket must survive

Prints one JSON object on stdout.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import websockets

BASE = os.environ.get("PHASE0_BASE", "http://127.0.0.1:8012")
WS = BASE.replace("http://", "ws://").replace("https://", "wss://") + "/api/door/ws?overlay=json"

PHOTO = Path(__file__).resolve().parent / "fixtures" / "check_photo.jpg"


async def main() -> dict:
    out: dict = {}

    async with websockets.connect(WS, max_size=None, open_timeout=30) as socket:
        await socket.send(b"")
        reply = json.loads(await asyncio.wait_for(socket.recv(), timeout=60))
        out["empty_frame_reply"] = reply

        # Still alive? A real picture over the same socket is the only proof.
        await socket.send(PHOTO.read_bytes())
        reply = json.loads(await asyncio.wait_for(socket.recv(), timeout=120))
        out["socket_survived_empty_frame"] = "error" not in reply
        out["photo_reply_keys"] = sorted(reply)[:12]

        await socket.send(b"not an image")
        reply = json.loads(await asyncio.wait_for(socket.recv(), timeout=60))
        out["non_image_reply"] = reply

        await socket.send(PHOTO.read_bytes())
        reply = json.loads(await asyncio.wait_for(socket.recv(), timeout=120))
        out["socket_survived_non_image"] = "error" not in reply

    return out


try:
    print(json.dumps(asyncio.run(main())))
except Exception as exc:  # noqa: BLE001
    print(json.dumps({"__error__": f"{type(exc).__name__}: {exc}"}))
    sys.exit(0)
