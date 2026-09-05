"""
SMART-SEG Smoke Test
=====================
Boots the app in MOCK mode as a subprocess, waits for the server to come up,
and checks that every page and API route responds. Used by CI to catch
missing dependencies and import/startup breakage on a clean checkout.

Two entrypoints, because they are different code paths and deployments use the
second one: app.py runs the Werkzeug development server from its
`if __name__ == "__main__"` block, while wsgi.py is what gunicorn imports and
has to start the simulation itself.

Usage:
    python scripts/smoke_test.py                    # app.py + Werkzeug (default)
    python scripts/smoke_test.py --server gunicorn  # wsgi.py + gunicorn
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "http://127.0.0.1:5000"
BOOT_TIMEOUT_S = 180

# Routes that must return HTTP 200 once the server is up.
ROUTES = [
    "/", "/camera", "/sensors", "/logs", "/ntpc", "/config", "/knowledge",
    "/api/config", "/api/stats", "/api/decisions", "/api/analytics_plot",
]

# localhost must never go through a proxy, even when one is configured.
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch(path, timeout=60):
    """GET a path; return (status, body_bytes)."""
    try:
        with _opener.open(BASE + path, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def wait_for_boot(proc):
    """Poll / until the server answers, or the process dies, or we time out."""
    deadline = time.time() + BOOT_TIMEOUT_S
    while time.time() < deadline:
        if proc.poll() is not None:
            return False
        try:
            if fetch("/", timeout=5)[0] == 200:
                return True
        except OSError:
            pass  # not listening yet
        time.sleep(2)
    return False


def server_command(kind):
    """The argv for one of the two supported entrypoints."""
    if kind == "gunicorn":
        # Mirrors the Dockerfile and deploy/smartseg.service, -w 1 included:
        # more than one worker would mean more than one independent simulation.
        return [
            sys.executable, "-m", "gunicorn",
            "-k", "gthread", "-w", "1", "--threads", "12", "--timeout", "120",
            "-b", "127.0.0.1:5000", "wsgi:application",
        ]
    return [sys.executable, "app.py"]


def main():
    kind = "gunicorn" if "--server=gunicorn" in sys.argv or (
        "--server" in sys.argv and "gunicorn" in sys.argv) else "werkzeug"

    env = dict(os.environ, SMARTSEG_SENSOR_MODE="MOCK", PYTHONUNBUFFERED="1")
    proc = subprocess.Popen(
        server_command(kind),
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    failures = []
    try:
        label = "wsgi.py under gunicorn" if kind == "gunicorn" else "app.py"
        print(f"Booting {label} (timeout {BOOT_TIMEOUT_S}s, classifier trains at startup)...")
        if not wait_for_boot(proc):
            print("FAIL: server did not come up. Output:")
            proc.kill()
            print(proc.communicate()[0])
            return 1
        print("Server is up.\n")

        for path in ROUTES:
            status, body = fetch(path)
            ok = status == 200
            print(f"  {'ok  ' if ok else 'FAIL'} {path:<22} {status} ({len(body)} bytes)")
            if not ok:
                failures.append(f"{path} returned {status}")

        # /api/config must be JSON carrying the simulation's shape.
        status, body = fetch("/api/config")
        if status == 200:
            try:
                cfg = json.loads(body)
                for key in ("conveyor", "sensors", "ai", "item_types"):
                    if key not in cfg:
                        failures.append(f"/api/config missing key '{key}'")
                if not cfg.get("item_types"):
                    failures.append("/api/config item_types is empty")
                else:
                    print(f"\n  ok   /api/config exposes {len(cfg['item_types'])} item types")
            except json.JSONDecodeError as e:
                failures.append(f"/api/config is not valid JSON: {e}")

        # /api/analytics_plot is the pandas/matplotlib path — assert a real PNG.
        status, body = fetch("/api/analytics_plot")
        if status == 200:
            try:
                payload = json.loads(body)
                b64 = payload.get("plot_b64", "")
                # base64 of a PNG always starts with the iVBORw0KGgo signature.
                if not b64.startswith("iVBORw0KGgo"):
                    failures.append("/api/analytics_plot did not return PNG data")
                else:
                    print(f"  ok   /api/analytics_plot returned a {len(b64)}-char PNG")
            except json.JSONDecodeError as e:
                failures.append(f"/api/analytics_plot is not valid JSON: {e}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()

    print()
    if failures:
        print(f"SMOKE TEST FAILED ({len(failures)} problem(s)):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"SMOKE TEST PASSED — {len(ROUTES)} routes healthy ({kind}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
