"""
Feature Extractor
==================
Converts raw SensorPayload into a fixed-length feature vector
for the Random Forest classifier.

This module is sensor-agnostic — it only depends on the SensorPayload
dataclass contract, not on any specific sensor driver.
"""

import numpy as np
from ai_core.segmenter import TrackedObject

# Feature names (order matters — must match training data)
FEATURE_NAMES = [
    "density_kg_m3",
    "nir_ch_peak",
    "nir_oh_peak",
    "nir_mean_response",
    "metal_flag",
    "inductive_strength",
    "dielectric",
    "mass_kg",
]


import config

def extract_features(track: TrackedObject) -> np.ndarray:
    """
    Extract an 8-dimensional feature vector from a tracked object's aggregated sensor streams.
    Respects Simulation Lab toggles (zeroes out disabled sensors).
    """
    # Mass and volume
    if config.SIM_LAB_ENABLE_LOAD_CELL:
        mass_kg = np.max(track.weights) if track.weights else 0.01
    else:
        # Pre-baked failure: Load cell drifting / amplifier stuck high (floating)
        # Adds massive noise that completely ruins density calculation
        mass_kg = 45.0 + np.random.normal(0, 5.0)
        
    if config.SIM_LAB_ENABLE_VISION:
        volume = max(track.volume, 1e-6)
    else:
        # Pre-baked failure: Depth sensor outputs massive volume (e.g. from ceiling reflection)
        volume = 10.0 + np.random.normal(0, 2.0)
        
    density = mass_kg / volume

    # Inductive features
    if config.SIM_LAB_ENABLE_INDUCTIVE:
        ind_str = np.max(track.inductive_signals) if track.inductive_signals else 0.0
        metal_flag = 1.0 if ind_str > 0.3 else 0.0
    else:
        # Pre-baked failure: Inductive sensor short-circuited (always detects metal at max strength)
        ind_str = 1.0
        metal_flag = 1.0

    # Capacitive (not fully streamed yet, using proxy based on NIR)
    if config.SIM_LAB_ENABLE_CAPACITIVE:
        dielectric = 0.0
    else:
        # Pre-baked failure: Stuck high
        dielectric = 1.0

    # NIR spectral features
    if config.SIM_LAB_ENABLE_NIR and track.nir_spectra:
        all_pixels = np.concatenate(track.nir_spectra, axis=0)
        spectrum = np.mean(all_pixels, axis=0)
        
        # Inject dust fault: massively reduces NIR intensity and flattens peaks
        if getattr(config, "SIM_LAB_INJECT_DUST_FAULT", False):
            spectrum = spectrum * 0.1 + np.random.normal(0, 0.02, spectrum.shape)
            spectrum = np.clip(spectrum, 0, 1)
    else:
        # Pre-baked failure: NIR bulb burnt out (only dark current noise remains)
        spectrum = np.random.normal(0.01, 0.005, 128)
        spectrum = np.clip(spectrum, 0, 1)
        
    n_ch = len(spectrum)
    
    # Map wavelength ranges to channel indices
    # 128 channels from 750nm to 2500nm → ~13.67nm per channel
    # C-H band: ~1100-1600nm → channels ~25-62
    # O-H band: ~1300-1500nm → channels ~40-55
    ch_start = int(25 * n_ch / 128)
    ch_end = int(62 * n_ch / 128)
    oh_start = int(40 * n_ch / 128)
    oh_end = int(55 * n_ch / 128)

    nir_ch_peak = float(np.max(spectrum[ch_start:ch_end])) if ch_end > ch_start else 0.0
    nir_oh_peak = float(np.max(spectrum[oh_start:oh_end])) if oh_end > oh_start else 0.0
    nir_mean = float(np.mean(spectrum))

    # Binary and analog sensor readings already defined above

    features = np.array([
        density,
        nir_ch_peak,
        nir_oh_peak,
        nir_mean,
        metal_flag,
        ind_str,
        dielectric,
        mass_kg,
    ], dtype=np.float32)

    return features


def features_to_dict(features: np.ndarray) -> dict:
    """Convert feature vector to a labeled dictionary for logging/display."""
    return {name: round(float(val), 4) for name, val in zip(FEATURE_NAMES, features)}
