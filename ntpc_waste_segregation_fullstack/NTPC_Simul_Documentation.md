# SMART-SEG Simulation: Sensor Mocking and AI Engine Documentation

This document explains the underlying mechanics of how the NTPC SMART-SEG simulation generates realistic sensor data without physical hardware, and how the Artificial Intelligence (AI) model processes that data to make sorting decisions.

---

## 1. Real Hardware Specifications

The mock data is mathematically designed to match the specific operational constraints, error ranges, and distortion profiles of the real industrial sensors intended for the SMART-SEG hardware setup:

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

## 2. Mock Sensor Data Generation

Because this simulation runs without physical hardware, all sensor data is synthetically generated in real-time. The goal is to produce data streams that perfectly mimic the structure and noise profile of actual industrial hardware.

### 1.1 Material Physics Table (`item_models.py`)
At the core of the mock engine is the `MATERIAL_TABLE`. Every waste item spawned on the conveyor belongs to a specific category (e.g., PET Plastic, Thick Glass, Wet Biomass, Metal Scrap). This table defines the **ground truth** physical properties for each category:
- Density ranges (kg/m³)
- Base weight ranges (kg)
- Base RGB colors
- NIR C-H (Polymer) and O-H (Water) absorption strengths
- Dielectric constants
- Presence of metal (boolean)

### 1.2 Depth & Vision Sensors (ToF / RGB Camera)
- **Depth Map (`mock_provider.py` & `noise.py`):** When an item moves across the camera's field of view, the system calculates its exact pixel location based on the conveyor speed. It generates a 2D Gaussian "bump" in the depth array corresponding to the item's physical dimensions (width, height, depth), creating a realistic 3D volumetric representation. Finally, synthetic noise is added:
  - **Gaussian Noise:** Added across the frame with a standard deviation (`sigma`) of **4.0 mm**, mirroring the typical RMS error of a RealSense D435i at a 1-meter distance.
  - **Dead Pixels:** IR interference and reflective scattering are simulated by setting a random **0.5%** of the pixels in the depth frame to 0.
- **RGB Camera:** The system takes the base color of the material and applies a randomized texture overlay to simulate lighting and dirt variations.

### 1.3 Hyperspectral NIR Scanner
- **Spectral Templates:** At startup, the system builds an ideal 128-channel spectral signature for each material based on its chemical bonds.
  - C-H bonds (plastics) generate Gaussian absorption peaks at ~1200nm, ~1725nm, and ~910nm.
  - O-H bonds (water/biomass) generate peaks at ~1400nm and ~1950nm.
  - Inert materials like stone and glass have flat spectra.
- **Noise Injection (`noise.py`):** As the object crosses the scanner line, the ideal spectrum is multiplied by a spatial falloff to simulate the object's edges. The system then applies two mathematically accurate noise functions based on a configured Signal-to-Noise Ratio (SNR) of **25 dB**:
  - **Photon Shot Noise:** Signal-dependent noise that scales with `sqrt(signal) * 0.02`.
  - **Dark Current Noise:** A constant baseline normal noise scaled to the overall noise power required by the 25 dB SNR constraint. The 25 dB target was specifically chosen to reflect an 87-92% real-world accuracy reduction caused by dust and labels on industrial belts.

### 1.4 Inductive & Load Cell Sensors
- **Load Cell:** The system uses the item's true mass and adds high-frequency electrical Gaussian jitter with a standard deviation (`sigma`) of **0.15 kg** (±150g). An exponential decay function is also added to simulate the mechanical settling drift that occurs as objects hit the scale.
- **Inductive & Capacitive:** 
  - **Inductive Metal Sensor:** Checks the boolean `metal_present` flag and outputs a signal strength between 0.6–0.95 for metals. To mimic real-world metallic dust and EM interference, there is a **2% probability of a false positive** (detecting metal when none is present) and a **0.5% probability of a false negative**. Gaussian electrical noise (`sigma = 0.03`) is applied to the final signal.
  - **Capacitive Sensor:** Outputs a dielectric constant with Gaussian noise (`sigma = 0.03` on a 0-1 scale).

---

## 2. Artificial Intelligence Engine

The decision engine is responsible for taking the raw continuous sensor streams, extracting relevant features, and classifying the object as `SAFE` or `HAZARD` (meaning it should be diverted).

### 2.1 Feature Extraction (`feature_extractor.py`)
When the Computer Vision segmenter tracks an object across the sensor zones, it buffers the sensor readings. Once the object leaves the scanning zone, the following features are extracted into an 8-dimensional vector:
1. `mass_kg`: Maximum reading from the load cell array.
2. `volume`: Calculated from the 3D bounding box of the depth map.
3. `density_kg_m3`: Calculated via `mass / volume`.
4. `ind_str`: Maximum reading from the inductive sensor array.
5. `metal_flag`: Boolean (1.0 if `ind_str` > 0.3).
6. `dielectric`: Approximation of the capacitive reading.
7. `nir_ch_peak`: The maximum absorption value within the 1100–1600nm range of the averaged NIR spectrum.
8. `nir_oh_peak`: The maximum absorption value within the 1300–1500nm range of the averaged NIR spectrum.

### 2.2 Random Forest Classifier (`classifier.py`)
The system uses a **Random Forest Classifier** (`scikit-learn`) due to its high interpretability and speed.

- **Synthetic Pre-Training:** Because there is no real-world dataset to load, the model trains itself at startup. It calls `_generate_training_data()`, which loops through the `MATERIAL_TABLE` and generates 5,000 randomized synthetic feature vectors representing various waste types. It applies the same statistical noise distributions used in the mock sensors to ensure the training data exactly matches the simulated environment.
- **Inference:** The Random Forest instantly classifies the 8-dim vector. If the prediction is `HAZARD`, the engine optionally infers the specific hazard type (e.g., Heavy Metal, Biomass, High Density) using heuristic thresholding on the features.
- **Failsafes:** After the AI makes a prediction, a hard-coded failsafe checks critical limits (e.g., if density > 2000 kg/m³, force HAZARD). This prevents the ML model from missing extremely dangerous objects.
