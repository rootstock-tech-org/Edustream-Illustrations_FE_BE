"""
SMART-SEG production entrypoint
================================
What gunicorn imports. `app.py` boots the simulation inside its
`if __name__ == "__main__"` block, which never runs under a WSGI server, so the
classifier training and the 30 Hz loop are started here instead.

    gunicorn -k gthread -w 1 --threads 12 --timeout 120 -b 0.0.0.0:5000 wsgi:application

`-w 1` is not a tuning choice, it is a correctness requirement. All simulation
state lives in memory in this process: a second worker is a second, independent
conveyor, and clients would be load-balanced between two different realities.
Scale by giving the one worker a faster core, not by adding workers.

Threads carry concurrent Socket.IO clients (the sim runs on its own thread
regardless), so `--threads` sets roughly how many dashboards can be open at once.

Import is slow — the classifier trains on 5,000 synthetic vectors at startup,
about 8 seconds — which is why `--timeout 120` is set above; the default 30 s
worker timeout is comfortable but leaves little margin on a throttled instance.
"""

import atexit

import app as _app

# Train the Random Forest, then start the background simulation thread. This
# module is imported once per worker process, so each runs exactly once —
# `start()` is guarded against a double call but `initialize()` would retrain.
#
# Do not run gunicorn with --preload: it imports this in the master and then
# forks, and the simulation thread would not survive the fork, leaving a belt
# that never moves.
_app.sim.initialize()
_app.sim.start()

atexit.register(_app.sim.shutdown)

# The name gunicorn looks for: `wsgi:application`.
application = _app.app

# Flask-SocketIO wraps the Flask app's WSGI callable when the server is created,
# so exporting `app.app` above is what carries Socket.IO's routing. Exposed under
# both names because `wsgi:app` is the more common convention and costs nothing.
app = application
