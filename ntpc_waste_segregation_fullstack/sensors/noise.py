"""
Sensor Noise Utilities
=======================
Functions to add realistic sensor noise to synthetic data.
Models based on actual sensor datasheets and typical operating conditions.
"""

import numpy as np


def add_depth_noise(frame: np.ndarray, sigma: float = 3.0) -> np.ndarray:
    """
    Add Gaussian noise to a depth frame (uint16, mm).
    
    RealSense D435i typical depth noise is ~2-5mm at 0.5-1m range.
    Also adds occasional "dead pixels" (value=0) to simulate
    IR interference or reflective surfaces.
    
    Args:
        frame: (H, W) uint16 depth frame in mm
        sigma: standard deviation of noise in mm
    
    Returns:
        Noisy depth frame (uint16)
    """
    noise = np.random.normal(0, sigma, frame.shape).astype(np.float32)
    noisy = frame.astype(np.float32) + noise
    
    # Dead pixels: ~0.5% probability at random locations
    dead_mask = np.random.random(frame.shape) < 0.005
    noisy[dead_mask] = 0
    
    # Clamp to valid uint16 range
    noisy = np.clip(noisy, 0, 65535)
    return noisy.astype(np.uint16)


def add_nir_noise(spectrum: np.ndarray, snr_db: float = 40.0) -> np.ndarray:
    """
    Add shot noise + dark current to NIR spectral data.
    
    Real NIR sensors have photon shot noise (proportional to sqrt(signal))
    and a constant dark current baseline.
    
    Args:
        spectrum: (N,) or (H, N) float32 spectral data, range 0-1
        snr_db: signal-to-noise ratio in decibels
    
    Returns:
        Noisy spectrum (float32, clipped to 0-1)
    """
    snr_linear = 10 ** (snr_db / 20)
    signal_power = np.mean(spectrum ** 2) + 1e-10
    noise_power = signal_power / (snr_linear ** 2)
    
    # Shot noise (signal-dependent)
    shot_noise = np.random.normal(0, np.sqrt(np.abs(spectrum) + 1e-6) * 0.02, spectrum.shape)
    
    # Dark current (constant baseline)
    dark_current = np.random.normal(0, np.sqrt(noise_power), spectrum.shape)
    
    noisy = spectrum + shot_noise + dark_current
    return np.clip(noisy, 0.0, 1.0).astype(np.float32)


def add_weight_jitter(weight: float, sigma: float = 0.05) -> float:
    """
    Add electrical noise to HX711 load cell reading.
    
    Real HX711 at 10 SPS has ~50g noise floor with typical load cells.
    Also simulates slight settling drift.
    
    Args:
        weight: true weight in kg
        sigma: noise standard deviation in kg
    
    Returns:
        Noisy weight reading (float, never negative)
    """
    # Gaussian electrical noise
    noise = np.random.normal(0, sigma)
    
    # Slight settling drift (exponential decay artifact)
    drift = np.random.exponential(sigma * 0.3) * np.random.choice([-1, 1])
    
    return max(0.0, weight + noise + drift)


def add_inductive_noise(
    metal_present: bool,
    signal_strength: float,
    false_positive_rate: float = 0.001,
    false_negative_rate: float = 0.005,
) -> tuple[bool, float]:
    """
    Add noise to inductive sensor readings.
    
    Inductive sensors can have false triggers from electromagnetic
    interference or miss small/distant metal pieces.
    
    Args:
        metal_present: ground truth metal presence
        signal_strength: ground truth signal (0-1)
        false_positive_rate: probability of detecting metal when none exists
        false_negative_rate: probability of missing metal when it exists
    
    Returns:
        (noisy_detected, noisy_strength)
    """
    # Random false positive/negative
    if metal_present and np.random.random() < false_negative_rate:
        return False, np.random.uniform(0, 0.05)
    if not metal_present and np.random.random() < false_positive_rate:
        return True, np.random.uniform(0.3, 0.6)
    
    # Add analog noise to signal strength
    noisy_strength = signal_strength + np.random.normal(0, 0.03)
    noisy_strength = float(np.clip(noisy_strength, 0.0, 1.0))
    
    return metal_present, noisy_strength


def add_capacitive_noise(reading: float, sigma: float = 0.03) -> float:
    """
    Add noise to capacitive sensor dielectric reading.
    
    Capacitive sensors are sensitive to humidity and distance variations.
    
    Args:
        reading: ground truth dielectric reading (0-1)
        sigma: noise standard deviation
    
    Returns:
        Noisy reading (float, clipped to 0-1)
    """
    noise = np.random.normal(0, sigma)
    # Humidity-induced drift (slow, correlated)
    humidity_drift = np.random.normal(0, sigma * 0.5)
    return float(np.clip(reading + noise + humidity_drift, 0.0, 1.0))
