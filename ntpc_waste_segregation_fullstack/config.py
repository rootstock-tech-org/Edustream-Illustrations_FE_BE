"""
SMART-SEG Configuration
========================
Centralized configuration for the NTPC waste segregation simulation.
Toggle USE_MOCK_SENSORS to False and implement RealSensorProvider when hardware arrives.
"""

import os


def _env_int(name: str, default: int) -> int:
    """Read an int from the environment, falling back on anything unparseable."""
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_flag(name: str, default: bool) -> bool:
    """Read a boolean from the environment. Accepts 1/true/yes/on, any case."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")

# ─── Sensor Mode ─────────────────────────────────────────────────────
# "MOCK"   — fully synthetic sensors, no hardware or extra drivers needed (default)
# "HYBRID" — synthetic sensors plus a live RealSense RGB feed on /camera,
#            requires `pip install -r requirements-hardware.txt`
# "REAL"   — all readings from physical hardware (see sensors/real_provider.py)
# Override without editing this file:  SMARTSEG_SENSOR_MODE=HYBRID python app.py
SENSOR_MODE = os.environ.get("SMARTSEG_SENSOR_MODE", "MOCK").upper()

# ─── Conveyor Belt ───────────────────────────────────────────────────
CONVEYOR_WIDTH_M = 1.4          # meters (range: 1.2–1.6)
CONVEYOR_LENGTH_M = 3.0         # meters (visible section)
CONVEYOR_SPEED_MS = 0.5         # meters/second (range: 0.4–0.7)
CONVEYOR_GRID_RES_CM = 1        # cm per grid cell
SCAN_ZONE_START_M = 1.0         # distance from entry where sensors scan
SCAN_ZONE_LENGTH_M = 0.5        # length of the scanning zone
DIVERTER_GATE_POS_M = 2.2       # position of the diverter gate

# ─── Item Spawning ───────────────────────────────────────────────────
SPAWN_RATE_PER_MIN = 120        # items per minute (range: 120–150)
ITEM_TYPE_PROBABILITIES = {
    "stone":              0.08,
    "tire_metal":         0.05,
    "thick_glass":        0.06,
    "plastic_bag_organic": 0.22,
    "plastic_bag_stone":  0.04,  # The critical hidden-hazard case
    "wet_organic":        0.20,
    "metal_scrap":        0.05,
    "wood_paper":         0.15,
    "lithium_battery":    0.03,
    "textile_scrap":      0.08,
    "ceramic_plate":      0.02,
    "procedural_anomaly": 0.02,
}

# ─── RealSense D435i ────────────────────────────────────────────────
DEPTH_WIDTH = 640
DEPTH_HEIGHT = 480
DEPTH_FPS = 30
RGB_WIDTH = 640
RGB_HEIGHT = 480
# D435i intrinsic parameters (typical factory calibration)
D435I_FX = 615.96
D435I_FY = 616.11
D435I_CX = 320.0
D435I_CY = 240.0
DEPTH_BASELINE_MM = 800         # conveyor surface distance from camera (mm)
DEPTH_NOISE_SIGMA = 4           # std dev in mm for depth noise (D435i at 1m is ~2.5-5mm RMS error)

# ─── NIR Line Scanner ───────────────────────────────────────────────
NIR_CHANNELS = 128              # spectral channels
NIR_WAVELENGTH_START_NM = 750   # nanometers
NIR_WAVELENGTH_END_NM = 2500    # nanometers
NIR_LINE_WIDTH_PX = 256         # spatial pixels per scan line
NIR_SCAN_RATE_HZ = 100          # line scans per second
NIR_SNR_DB = 25                 # signal-to-noise ratio (Lowered to reflect 87-92% real-world accuracy due to dirt/labels)

# ─── HX711 Load Cell ────────────────────────────────────────────────
LOADCELL_NOISE_SIGMA_KG = 0.15  # ±150g noise (Dynamic conveyor weighing systemic errors)
LOADCELL_SETTLING_TIME_MS = 100 # ms to stabilize reading
LOADCELL_MAX_CAPACITY_KG = 50   # maximum measurable weight

# ─── Inductive Sensor ───────────────────────────────────────────────
INDUCTIVE_FALSE_POS_RATE = 0.02  # 2% probability of false metal detection (Metallic dust/interference)
INDUCTIVE_RANGE_MM = 30           # detection range in mm

# ─── Capacitive Sensor ──────────────────────────────────────────────
CAPACITIVE_NOISE_SIGMA = 0.03    # noise on 0-1 scale
CAPACITIVE_RANGE_MM = 25         # detection range in mm

# ─── AI Classifier ──────────────────────────────────────────────────
RF_N_ESTIMATORS = 100
RF_MAX_DEPTH = 12
RF_TRAINING_SAMPLES = 5000
CONFIDENCE_THRESHOLD = 0.70      # below this → flag for manual review
# Failsafe override thresholds
DENSITY_HAZARD_THRESHOLD = 1500  # kg/m³ — above this + low NIR → auto HAZARD
NIR_LOW_THRESHOLD = 0.1         # below this = no polymer signature
MASS_HEAVY_THRESHOLD = 5.0      # kg — items above this with metal → auto HAZARD

# ─── Simulation Loop ────────────────────────────────────────────────
# The loop is CPU-bound: segmentation plus PNG encoding saturates roughly one
# core at 30 Hz, and it runs whether or not a browser is connected. On a small
# or burstable instance, lower this rather than letting the host throttle.
# Measured: 30 Hz ~103% of a core, 15 Hz ~82%. Halving the tick rate buys about
# 20%, not 50%, because _generate_sensor_views() is throttled to 10 Hz on its
# own timer and so does not scale down with TICK_RATE_HZ.
TICK_RATE_HZ = _env_int("SMARTSEG_TICK_RATE_HZ", 30)   # simulation ticks per second
EMIT_RATE_HZ = _env_int("SMARTSEG_EMIT_RATE_HZ", 30)   # WebSocket emit rate

# ─── Server ──────────────────────────────────────────────────────────
HOST = os.environ.get("SMARTSEG_HOST", "0.0.0.0")
# PORT is read from $PORT as well as $SMARTSEG_PORT: container platforms such as
# App Runner and Elastic Beanstalk inject the former and expect it to be honoured.
PORT = _env_int("SMARTSEG_PORT", _env_int("PORT", 5000))
DEBUG = _env_flag("SMARTSEG_DEBUG", True)

# Origins allowed to open a Socket.IO connection. The "*" default keeps local
# development and the smoke test working from any host; set this to your real
# origin in any deployment reachable by others, e.g.
#   SMARTSEG_CORS_ORIGINS=https://smartseg.example.com
# Comma-separated values become a list, which is what Flask-SocketIO expects.
_cors = os.environ.get("SMARTSEG_CORS_ORIGINS", "*").strip()
CORS_ORIGINS = "*" if _cors == "*" else [o.strip() for o in _cors.split(",") if o.strip()]

# ─── Simulation Interactive Lab Toggles ──────────────────────────────
SIM_LAB_ENABLE_VISION = True
SIM_LAB_ENABLE_NIR = True
SIM_LAB_ENABLE_LOAD_CELL = True
SIM_LAB_ENABLE_INDUCTIVE = True
SIM_LAB_ENABLE_CAPACITIVE = True
SIM_LAB_INJECT_DUST_FAULT = False
