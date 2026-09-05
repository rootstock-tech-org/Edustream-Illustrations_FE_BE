"""
SMART-SEG Flask Application
=============================
Entry point for the NTPC waste segregation simulation.
Serves the dashboard frontend and handles WebSocket communication.

Usage:
    python app.py
    → Open http://localhost:5000 in your browser
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, render_template, jsonify, make_response
from flask_socketio import SocketIO, emit
import io
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

from server.simulation_loop import SimulationLoop
from sensors.item_models import MATERIAL_TABLE
import config

# ─── Flask App Setup ─────────────────────────────────────────────────
app = Flask(__name__)
# Set SMARTSEG_SECRET_KEY in any deployment that is reachable by others —
# the fallback below is a development convenience, not a secret.
app.config["SECRET_KEY"] = os.environ.get(
    "SMARTSEG_SECRET_KEY", "dev-only-insecure-key"
)

# cors_allowed_origins defaults to "*" for local development; set
# SMARTSEG_CORS_ORIGINS to your real origin in a deployment (see config.py).
socketio = SocketIO(
    app, cors_allowed_origins=config.CORS_ORIGINS, async_mode="threading"
)

# ─── Simulation ──────────────────────────────────────────────────────
sim = SimulationLoop(socketio)


# ─── HTTP Routes ─────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main dashboard."""
    return render_template("index.html")

@app.route("/camera")
def camera():
    """Serve the live camera feed with annotations."""
    return render_template("camera.html")


@app.route("/sensors")
def sensors():
    """Sensor Suite — the NIR and fusion panels moved off the Overview."""
    return render_template("sensors.html")


@app.route("/knowledge")
def knowledge():
    """Reference page: how the sensor array and the pipeline actually work."""
    return render_template("knowledge.html", materials=MATERIAL_TABLE, cfg=config)

@app.route("/logs")
def logs():
    """Serve the dedicated logs page."""
    return render_template("logs.html")

@app.route("/ntpc")
def ntpc():
    """Serve the NTPC professional operations dashboard."""
    return render_template("ntpc.html")

@app.route("/learning")
def learning():
    """Serve the Interactive Learning & Simulation Module."""
    return render_template("learning.html")


@app.route("/config")
def config_page():
    """Serve the read-only configuration viewer."""
    return render_template("config.html")


@app.route("/api/config")
def get_config():
    """Return current simulation configuration."""
    return jsonify({
        "conveyor": {
            "width": config.CONVEYOR_WIDTH_M,
            "length": config.CONVEYOR_LENGTH_M,
            "speed": config.CONVEYOR_SPEED_MS,
            "scan_zone_start": config.SCAN_ZONE_START_M,
            "scan_zone_length": config.SCAN_ZONE_LENGTH_M,
            "diverter_pos": config.DIVERTER_GATE_POS_M,
        },
        "sensors": {
            "depth_resolution": f"{config.DEPTH_WIDTH}x{config.DEPTH_HEIGHT}",
            "nir_channels": config.NIR_CHANNELS,
            "nir_range": f"{config.NIR_WAVELENGTH_START_NM}-{config.NIR_WAVELENGTH_END_NM}nm",
            "loadcell_noise": f"±{config.LOADCELL_NOISE_SIGMA_KG*1000:.0f}g",
        },
        "ai": {
            "n_estimators": config.RF_N_ESTIMATORS,
            "confidence_threshold": config.CONFIDENCE_THRESHOLD,
            "density_hazard_threshold": config.DENSITY_HAZARD_THRESHOLD,
            "mass_heavy_threshold": config.MASS_HEAVY_THRESHOLD,
        },
        "item_types": {
            k: {
                "label": v.label,
                "is_hazard": v.is_hazard,
                "density_range": v.density_range,
                "weight_range": v.weight_range,
                "color": list(v.color_rgb),
            }
            for k, v in MATERIAL_TABLE.items()
        },
        "spawn_rate": config.SPAWN_RATE_PER_MIN,
        "use_mock": getattr(config, "SENSOR_MODE", "MOCK") != "REAL",
        # What is really running, after any fallback — not the configured value.
        "sensor_mode": sim.active_sensor_mode,
    })


@app.route("/api/decisions")
def get_decisions():
    """
    Return the server-side classification history.

    The audit log used to live only in browser memory, so every navigation to
    /logs started from an empty list. The simulation has always kept this
    history in DecisionEngine.decision_log; it simply was not reachable.
    Newest first, so the client can render it without re-sorting.
    """
    log = sim.decision_engine.decision_log
    return jsonify([
        {
            "item_id": entry.get("item_id"),
            "item_type": entry.get("item_type"),
            "decision": entry.get("decision"),
            "confidence": entry.get("confidence"),
            "timestamp": entry.get("timestamp"),
        }
        for entry in reversed(log)
    ])


@app.route("/api/stats")
def get_stats():
    """Return AI decision statistics."""
    return jsonify(sim.decision_engine.stats)


@app.route("/api/analytics_plot")
def get_analytics_plot():
    """Generate and return a Seaborn plot of Density vs Hazard Probability."""
    try:
        # Get the training data from the classifier
        # For this plot, we'll generate a representative KDE plot based on the model
        sns.set_theme(style="whitegrid")
        fig, ax = plt.subplots(figsize=(6, 4))
        
        # We simulate a dataframe representing the feature space the model trained on
        # to show the distribution of Density (kg/m3) for Safe vs Hazard
        safe_densities = np.random.normal(800, 200, 500)
        hazard_densities = np.random.normal(1800, 300, 300)
        
        df_safe = pd.DataFrame({'Density': safe_densities, 'Class': 'Safe'})
        df_hazard = pd.DataFrame({'Density': hazard_densities, 'Class': 'Hazard'})
        df = pd.concat([df_safe, df_hazard])
        
        # Create plot
        sns.kdeplot(data=df, x='Density', hue='Class', fill=True, 
                    palette={'Safe': '#16854d', 'Hazard': '#c0392b'}, ax=ax, alpha=0.5)
        ax.set_title("Density Distribution by Class")
        ax.set_xlabel("Density (kg/m³)")
        ax.set_xlim(0, 3000)
        
        plt.tight_layout()
        
        # Save to base64
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100)
        buf.seek(0)
        img_b64 = base64.b64encode(buf.read()).decode('ascii')
        plt.close(fig)
        
        return jsonify({"plot_b64": img_b64})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sim/start", methods=["POST"])
def start_sim():
    sim.start()
    return jsonify({"status": "running"})

@app.route("/api/sim/stop", methods=["POST"])
def stop_sim():
    sim.stop()
    return jsonify({"status": "stopped"})

@app.route("/api/sim/reset", methods=["POST"])
def reset_sim():
    sim.reset()
    return jsonify({"status": "reset"})


@app.route("/api/reconnect_camera", methods=["POST"])
def reconnect_camera():
    """Attempt to reconnect the physical camera."""
    try:
        provider = sim.sensor_provider
        if hasattr(provider, "_stop_pipeline"):
            # Restart only the camera pipeline, not the mock sensor stack the
            # simulation is still running on.
            provider._stop_pipeline()
            provider.initialize()
            status = "Connected" if provider.camera_ready else "No Camera Detected"
        else:
            status = "Mock Mode (no camera support)"
        # Return the same shape the socket pushes, so the page renders one code
        # path whether the status arrived from a click or from a state update.
        return jsonify({"status": status, "camera": sim.camera_status()})
    except Exception as e:
        return jsonify({"status": "Error", "error": str(e)}), 500


@app.route("/sw.js")
def sw():
    """Dummy ServiceWorker to stop 404 logs."""
    response = make_response("", 200)
    response.mimetype = "application/javascript"
    return response

# ─── WebSocket Events ────────────────────────────────────────────────

@socketio.on("connect")
def handle_connect():
    """Client connected — send initial state."""
    print(f"[WS] Client connected")
    emit("initial_state", {
        "conveyor": sim.conveyor.get_state(),
        "line_config": sim.get_line_config(),
        # The mode actually in effect, not config.SENSOR_MODE — an unusable
        # provider falls back to MOCK, and the badge must not claim otherwise.
        "sensor_mode": sim.active_sensor_mode,
        "camera": sim.camera_status(),
        "ai_stats": sim.decision_engine.stats,
        "item_types": {
            k: {
                "label": v.label,
                "is_hazard": v.is_hazard,
                "color": list(v.color_rgb),
            }
            for k, v in MATERIAL_TABLE.items()
        },
    })


@socketio.on("disconnect")
def handle_disconnect():
    print(f"[WS] Client disconnected")


@socketio.on("spawn_item")
def handle_spawn(data):
    """Manually spawn a specific item type."""
    item_type = data.get("type", "stone")
    result = sim.spawn_manual(item_type)
    emit("item_spawned", result)


@socketio.on("update_config")
def handle_config_update(data):
    """Update simulation parameters."""
    sim.update_config(data)
    emit("config_updated", {"status": "ok", "updates": data})


@socketio.on("request_sensor_detail")
def handle_sensor_detail(data):
    """Return detailed sensor data for the currently scanned item."""
    item_id = data.get("item_id")
    detail = sim.get_sensor_detail(item_id)
    if detail:
        emit("sensor_detail", detail)


# ─── Main ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("  NTPC SMART-SEG: Waste Segregation Simulation")
    print("  Starting up...")
    print("=" * 60)

    # Initialize AI (train classifier)
    sim.initialize()

    # Start the simulation loop
    sim.start()

    print(f"\n  Dashboard: http://localhost:{config.PORT}")
    print(f"  Mode: {getattr(config, 'SENSOR_MODE', 'MOCK')} SENSORS")
    print("=" * 60)

    try:
        socketio.run(app, host=config.HOST, port=config.PORT, debug=False, allow_unsafe_werkzeug=True)
    except KeyboardInterrupt:
        pass
    finally:
        sim.shutdown()
        print("\n[SMART-SEG] Shutdown complete.")
