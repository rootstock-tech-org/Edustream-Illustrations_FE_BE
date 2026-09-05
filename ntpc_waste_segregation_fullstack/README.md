# NTPC SMART-SEG Simulation

**SMART-SEG** is a real-time, AI-powered industrial waste segregation simulation. It visually and mathematically simulates a conveyor belt system equipped with a multi-sensor fusion pipeline (Depth, RGB, Hyperspectral NIR, Load Cell, and Inductive sensors) to detect and classify hazardous waste items (like metal scraps, thick glass, and wet biomass) hidden among regular waste.

## 🚀 Getting Started

1. **Install Requirements:** Ensure you have Python installed, then run:
   ```bash
   pip install -r requirements.txt
   ```
2. **Run the Simulation:** Start the Flask application.
   ```bash
   python app.py
   ```
3. **Open the Dashboard:** Navigate to `http://localhost:5000` in your web browser.

### Configuration

Both settings default to safe local values; override them with environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SMARTSEG_SENSOR_MODE` | `MOCK` | `MOCK` (fully synthetic, no hardware), `HYBRID` (synthetic sensors + live RealSense RGB feed on `/camera`), or `REAL` (all physical hardware). |
| `SMARTSEG_SECRET_KEY` | `dev-only-insecure-key` | Flask session/Socket.IO signing key. Set a real value for any deployment others can reach. |

`HYBRID` and `REAL` additionally need the Intel RealSense driver, kept separate
because it does not install on every platform:

```bash
pip install -r requirements-hardware.txt
```

If the driver or the camera is missing, `HYBRID` still runs — it simply logs
that the camera is disabled and falls back to synthetic depth/RGB.

---

## 🔬 Sensor Data & AI Engine

Because this simulation runs without physical hardware, all sensor data is synthetically generated in real-time. The mock data is mathematically designed to match the specific operational constraints, error ranges, and distortion profiles of the real industrial sensors intended for the SMART-SEG hardware setup.

### 1. Real Hardware Specifications

1. **Depth Camera (Intel RealSense D435i)**
   - **Resolution:** 640x480 at 30 FPS
   - **Baseline Error:** $\pm$ 2-5mm RMS error at 1m distance. 
   - **Distortion Profile (Waste Segregation):** Depth accuracy degrades quadratically with distance. In waste segregation, the sensor is highly susceptible to "dead pixels" (zero-values) caused by infrared interference from shiny plastics (e.g. PET bottles), or absorption by extremely dark materials like rubber tires or wet organic sludge.

2. **NIR Hyperspectral Line Scanner (e.g., Specim FX17)**
   - **Resolution:** 256 spatial pixels × 128 spectral channels (750nm - 2500nm).
   - **Scan Rate:** 100 Hz line-scan frequency.
   - **Distortion Profile (Waste Segregation):** Highly susceptible to **Photon Shot Noise** (which scales with the square root of the incoming signal) and constant thermal **Dark Current Noise**. In industrial conveyor environments, dust, debris, and plastic labels drastically reduce the overall Signal-to-Noise Ratio (SNR) down to roughly **25 dB**. For example, a paper label on a plastic bottle or a layer of wet sludge will completely mask the underlying polymer's NIR signature, leading to an 8-13% accuracy reduction on raw spectral readings.

3. **Load Cell (HX711 Amplifier with 50kg Shear Beam)**
   - **Sampling Rate:** 10 to 80 Samples Per Second (SPS).
   - **Baseline Error:** High-frequency electrical jitter of approx $\pm$ 150g.
   - **Distortion Profile (Waste Segregation):** Slower dynamic response time. As heavy waste items drop and bounce onto the moving conveyor, the load cell experiences an exponential mechanical settling drift (ringing). If items are too close together, the ringing overlaps, making it difficult to isolate the mass of a single object.

4. **Inductive Metal Proximity Sensor**
   - **Detection Range:** ~30mm.
   - **Distortion Profile (Waste Segregation):** Susceptible to electromagnetic interference and metallic dust buildup on the sensor face, resulting in a **2% false-positive rate**. Also suffers from a **0.5% false-negative rate** for very small or highly oxidized non-ferrous fragments hidden inside larger organic clumps.

---

### 2. Mock Sensor Data Generation

At the core of the mock engine is the `MATERIAL_TABLE` (`item_models.py`). Every waste item spawned on the conveyor belongs to a specific category (e.g., PET Plastic, Thick Glass, Wet Biomass). This table defines the **ground truth** physical properties for each category:
- Density ranges (kg/m³)
- Base weight ranges (kg)
- Base RGB colors
- NIR C-H (Polymer) and O-H (Water) absorption strengths
- Dielectric constants
- Presence of metal (boolean)

#### Noise Injection (`noise.py`)
- **Depth Map:** Generates a 2D Gaussian "bump" in the depth array corresponding to the item's physical dimensions. Gaussian noise (`sigma = 4.0 mm`) and Dead Pixels (0.5%) are added.
- **NIR Scanner:** Ideal spectra are generated using Gaussian absorption peaks (e.g. C-H bonds at ~1725nm). Real-world Photon Shot Noise and Dark Current Noise are applied based on a 25 dB SNR. A full 2D hyperspectral map is captured and compressed into a false-color RGB image for the dashboard.
- **Load Cell:** Uses the item's true mass and adds high-frequency electrical Gaussian jitter (`sigma = 0.15 kg`) and exponential decay drift.
- **Inductive Sensor:** Checks the boolean metal flag, scaling a signal between 0.6–0.95, and forces random 2% false positives and 0.5% false negatives.

---

### 3. Artificial Intelligence Engine

The decision engine takes the raw continuous sensor streams, extracts features, and classifies the object as `SAFE` or `HAZARD` (meaning the robotic arm should divert it).

#### Feature Extraction (`feature_extractor.py`)
When the Computer Vision segmenter tracks an object across the sensor zones, it latches the maximum physical dimensions to prevent tracking failures at the edges. Once the object leaves the scanning zone, the following features are extracted into an 8-dimensional vector:
1. `mass_kg`: Maximum reading from the load cell array.
2. `volume`: Calculated from the 3D bounding box of the depth map.
3. `density_kg_m3`: Calculated via `mass / volume`.
4. `ind_str`: Maximum reading from the inductive sensor array.
5. `metal_flag`: Boolean (1.0 if `ind_str` > 0.3).
6. `dielectric`: Approximation of the capacitive reading.
7. `nir_ch_peak`: The maximum absorption value within the 1100–1600nm range of the averaged 1D NIR spectrum.
8. `nir_oh_peak`: The maximum absorption value within the 1300–1500nm range.

#### Random Forest Classifier (`classifier.py`)
- **Synthetic Pre-Training:** Because there is no real-world dataset to load, the `scikit-learn` Random Forest model trains itself at startup. It loops through the `MATERIAL_TABLE` and generates 5,000 randomized synthetic feature vectors, applying the exact same statistical noise distributions used in the mock sensors.
- **Inference & Failsafes:** The model classifies the 8-dim vector instantly. A hard-coded failsafe checks critical limits (e.g., if density > 1500 kg/m³ and NIR is low, force HAZARD) to prevent the ML model from missing extremely dangerous dense objects.
