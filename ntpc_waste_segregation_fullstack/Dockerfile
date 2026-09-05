# SMART-SEG — production image
#
# Single always-on process: one gunicorn worker serving the dashboard while the
# 30 Hz simulation thread runs beside it. See DEPLOYMENT.md for how to run this
# on EC2, App Runner or ECS.
#
#   docker build -t smartseg .
#   docker run -p 5000:5000 -e SMARTSEG_SECRET_KEY=$(openssl rand -hex 32) smartseg

FROM python:3.12-slim

# Unbuffered so container logs stream in real time instead of sitting in a pipe
# buffer; no .pyc files since the layer is immutable anyway.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first: this layer is cached until requirements.txt itself changes,
# which matters because scipy/sklearn/opencv take a few minutes to install.
# opencv-python-headless needs no system libraries, so there is no apt step here.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# Drop privileges. matplotlib and fontconfig want somewhere writable, and $HOME
# for a system user is not; point them at /tmp rather than widening permissions.
RUN useradd --system --create-home --home-dir /home/smartseg smartseg \
    && chown -R smartseg:smartseg /app
ENV MPLCONFIGDIR=/tmp/mpl \
    XDG_CACHE_HOME=/tmp/cache
USER smartseg

ENV SMARTSEG_SENSOR_MODE=MOCK \
    SMARTSEG_PORT=5000
EXPOSE 5000

# start-period covers the ~8 s the classifier spends training at startup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/stats' % os.environ.get('SMARTSEG_PORT','5000'), timeout=4)"

# -w 1 is mandatory: all simulation state is in memory in this process, so a
# second worker would be a second, independent conveyor. Scale up, not out.
# --timeout 120 leaves margin over the ~8 s startup training on a slow instance.
# Never add --preload; see the note in wsgi.py.
CMD ["sh", "-c", "exec gunicorn -k gthread -w 1 --threads 12 --timeout 120 --access-logfile - --error-logfile - -b 0.0.0.0:${SMARTSEG_PORT:-5000} wsgi:application"]
