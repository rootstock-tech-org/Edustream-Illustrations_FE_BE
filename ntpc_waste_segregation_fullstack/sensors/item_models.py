"""
Item Models & Material Property Tables
========================================
Dataclasses for waste items and sensor payloads.
Material lookup tables encode the real-world physics used for synthetic data generation.
"""

from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class MaterialProperties:
    """Physical properties of a waste material type."""
    density_range: tuple[float, float]      # kg/m³ (min, max)
    nir_ch_response: tuple[float, float]    # C-H bond absorption (0-1)
    nir_oh_response: tuple[float, float]    # O-H bond absorption (0-1)
    metal_present: bool                      # does it contain metal?
    dielectric_range: tuple[float, float]   # capacitive response (0-1)
    weight_range: tuple[float, float]       # typical weight in kg
    color_rgb: tuple[int, int, int]         # representative color for visualization
    label: str                               # human-readable name
    is_hazard: bool                          # ground truth classification


# ─── Material Lookup Table ───────────────────────────────────────────
# Based on real-world physics parameters from NTPC research document
MATERIAL_TABLE: dict[str, MaterialProperties] = {
    "stone": MaterialProperties(
        density_range=(2000, 2400),
        nir_ch_response=(0.0, 0.05),    # Inert — virtually zero C-H
        nir_oh_response=(0.0, 0.03),
        metal_present=False,
        dielectric_range=(0.05, 0.15),   # Low dielectric (dry mineral)
        weight_range=(3.0, 15.0),
        color_rgb=(140, 130, 120),        # Grey
        label="Stone / Concrete",
        is_hazard=True,
    ),
    "tire_metal": MaterialProperties(
        density_range=(1100, 1200),
        nir_ch_response=(0.3, 0.5),     # Rubber has some C-H
        nir_oh_response=(0.05, 0.15),
        metal_present=True,              # Steel wire reinforcement
        dielectric_range=(0.2, 0.4),
        weight_range=(5.0, 20.0),
        color_rgb=(30, 30, 35),           # Black
        label="Tire (metal wire)",
        is_hazard=True,
    ),
    "thick_glass": MaterialProperties(
        density_range=(2200, 2500),
        nir_ch_response=(0.0, 0.03),    # Glass is inert to NIR
        nir_oh_response=(0.02, 0.08),   # Slight O-H from surface
        metal_present=False,
        dielectric_range=(0.6, 0.8),     # Glass has moderate-high dielectric
        weight_range=(2.0, 8.0),
        color_rgb=(180, 220, 200),        # Greenish-clear
        label="Thick Glass",
        is_hazard=True,
    ),
    "plastic_bag_organic": MaterialProperties(
        density_range=(100, 300),
        nir_ch_response=(0.7, 0.95),    # Strong C-H from polyethylene
        nir_oh_response=(0.3, 0.5),     # O-H from moisture in organics
        metal_present=False,
        dielectric_range=(0.3, 0.5),
        weight_range=(0.1, 2.0),
        color_rgb=(60, 180, 80),          # Green
        label="Plastic Bag (organic)",
        is_hazard=False,
    ),
    "plastic_bag_stone": MaterialProperties(
        density_range=(1200, 2000),      # High! Stone inside plastic
        nir_ch_response=(0.4, 0.6),     # Mixed — plastic surface + stone core
        nir_oh_response=(0.1, 0.25),
        metal_present=False,
        dielectric_range=(0.15, 0.35),
        weight_range=(3.0, 10.0),
        color_rgb=(200, 180, 60),         # Yellow-brown
        label="Plastic Bag (stone hidden!)",
        is_hazard=True,
    ),
    "wet_organic": MaterialProperties(
        density_range=(400, 800),
        nir_ch_response=(0.5, 0.7),     # Cellulose C-H
        nir_oh_response=(0.7, 0.95),    # Very strong O-H from water
        metal_present=False,
        dielectric_range=(0.7, 0.9),     # Water has very high dielectric
        weight_range=(0.5, 5.0),
        color_rgb=(100, 70, 40),          # Brown
        label="Wet Organic Waste",
        is_hazard=False,
    ),
    "metal_scrap": MaterialProperties(
        density_range=(2500, 7800),
        nir_ch_response=(0.0, 0.05),    # Metals are inert
        nir_oh_response=(0.0, 0.03),
        metal_present=True,
        dielectric_range=(0.1, 0.2),
        weight_range=(1.0, 15.0),
        color_rgb=(180, 180, 190),        # Metallic silver
        label="Metal Scrap",
        is_hazard=True,
    ),
    "wood_paper": MaterialProperties(
        density_range=(200, 600),
        nir_ch_response=(0.4, 0.6),     # Cellulose C-H bonds
        nir_oh_response=(0.3, 0.5),     # O-H in cellulose
        metal_present=False,
        dielectric_range=(0.3, 0.5),
        weight_range=(0.2, 3.0),
        color_rgb=(180, 150, 100),        # Tan
        label="Wood / Paper",
        is_hazard=False,
    ),
    "lithium_battery": MaterialProperties(
        density_range=(2000, 3000),      # Dense cells
        nir_ch_response=(0.05, 0.15),    # Plastic casing
        nir_oh_response=(0.0, 0.05),
        metal_present=True,              # Metallic core
        dielectric_range=(0.4, 0.8),     # Electrolytes
        weight_range=(0.2, 2.0),
        color_rgb=(50, 50, 200),         # Blue/Dark casing
        label="Lithium Battery",
        is_hazard=True,
    ),
    "textile_scrap": MaterialProperties(
        density_range=(100, 300),        # Very light, porous
        nir_ch_response=(0.6, 0.8),      # Polyester/Cotton blends
        nir_oh_response=(0.2, 0.6),      # Absorbs moisture
        metal_present=False,
        dielectric_range=(0.1, 0.3),
        weight_range=(0.1, 1.5),
        color_rgb=(200, 50, 50),         # Red fabric
        label="Textile Scrap",
        is_hazard=False,
    ),
    "ceramic_plate": MaterialProperties(
        density_range=(2000, 2500),      # Dense like stone
        nir_ch_response=(0.0, 0.05),     # Inorganic
        nir_oh_response=(0.0, 0.05),
        metal_present=False,
        dielectric_range=(0.6, 0.9),     # High dielectric glazes
        weight_range=(0.3, 1.5),
        color_rgb=(240, 240, 240),       # White
        label="Ceramic Plate",
        is_hazard=True,
    ),
    "procedural_anomaly": MaterialProperties(
        density_range=(50, 4000),        # Anything from foam to solid lead
        nir_ch_response=(0.0, 1.0),      # Wildcard
        nir_oh_response=(0.0, 1.0),      # Wildcard
        metal_present=False,             # Keep false to not trigger metal override immediately
        dielectric_range=(0.0, 1.0),
        weight_range=(0.1, 20.0),
        color_rgb=(255, 0, 255),         # Magenta for visibility
        label="Procedural Anomaly",
        is_hazard=True,                  # Unknown = Hazard by default
    ),
}


@dataclass
class WasteItem:
    """Represents a single waste item on the conveyor belt."""
    id: str                              # unique identifier
    item_type: str                       # key into MATERIAL_TABLE
    position_x: float = 0.0             # meters from belt center
    position_y: float = 0.0             # meters from belt entry
    width: float = 0.15                 # meters
    height: float = 0.10                # meters (vertical extent)
    depth_extent: float = 0.12          # meters (along belt direction)
    mass_kg: float = 1.0                # actual mass
    state: str = "spawned"              # spawned → scanning → classified → diverted/passed
    decision: Optional[str] = None      # "SAFE" or "HAZARD"
    confidence: float = 0.0
    hazard_type: Optional[str] = None
    reasoning: str = ""
    spawn_time: float = 0.0            # simulation time when spawned

    @property
    def volume_m3(self) -> float:
        """Approximate volume from bounding box dimensions."""
        # Use 0.6 fill factor — items are not perfect cuboids
        return self.width * self.height * self.depth_extent * 0.6

    @property
    def density(self) -> float:
        """Computed density in kg/m³."""
        vol = self.volume_m3
        if vol <= 0:
            return 0.0
        return self.mass_kg / vol

    def to_dict(self) -> dict:
        """Serialize for WebSocket transmission."""
        mat = MATERIAL_TABLE.get(self.item_type)
        return {
            "id": self.id,
            "type": self.item_type,
            "label": mat.label if mat else self.item_type,
            "x": round(self.position_x, 3),
            "y": round(self.position_y, 3),
            "width": round(self.width, 3),
            "height": round(self.height, 3),
            "depth_extent": round(self.depth_extent, 3),
            "mass_kg": round(self.mass_kg, 2),
            "density": round(self.density, 1),
            "state": self.state,
            "decision": self.decision,
            "confidence": round(self.confidence, 3),
            "hazard_type": self.hazard_type,
            "reasoning": self.reasoning,
            "color": list(mat.color_rgb) if mat else [128, 128, 128],
            "is_hazard": mat.is_hazard if mat else False,
        }

@dataclass
class WasteCluster(WasteItem):
    """Represents a merged cluster of overlapping items (CV segmentation failure)."""
    items: list[WasteItem] = field(default_factory=list)

    @property
    def contains_hazard(self) -> bool:
        """True if any item in the cluster is a true hazard."""
        for item in self.items:
            mat = MATERIAL_TABLE.get(item.item_type)
            if mat and mat.is_hazard:
                return True
        return False
        
    @property
    def merged_label(self) -> str:
        """String representing the dominant items in the cluster."""
        return "Cluster(" + ",".join([i.item_type[:4] for i in self.items]) + ")"

@dataclass
class SensorPayload:
    """
    Unified sensor data payload for a single item scan.
    This is the contract between the Data Provider and the AI Core.
    When swapping from mock to real sensors, the provider must produce
    this exact same structure.
    """
    item_id: str
    # RealSense D435i outputs
    depth_frame: np.ndarray          # (480, 640) uint16 — distance in mm
    rgb_frame: np.ndarray            # (480, 640, 3) uint8
    point_cloud: np.ndarray          # (N, 3) float32 — XYZ in meters
    # NIR line scanner
    nir_spectrum: np.ndarray         # (128,) float32 — single spectrum
    nir_section_map: np.ndarray      # (num_lines, 128) float32 — accumulated section
    # HX711 load cell
    weight_kg: float
    # Inductive sensor
    inductive_metal: bool
    inductive_strength: float        # 0.0–1.0 analog signal
    # Capacitive sensor
    capacitive_dielectric: float     # 0.0–1.0
    # Metadata
    estimated_volume_m3: float       # from depth segmentation
    timestamp: float = 0.0

    def to_feature_dict(self) -> dict:
        """Extract a minimal feature summary for logging/display."""
        density = self.weight_kg / max(self.estimated_volume_m3, 1e-6)
        return {
            "item_id": self.item_id,
            "weight_kg": round(self.weight_kg, 3),
            "volume_m3": round(self.estimated_volume_m3, 6),
            "density_kg_m3": round(density, 1),
            "nir_ch_peak": round(float(np.max(self.nir_spectrum[20:60])), 3),  # ~1100-1600nm band
            "nir_oh_peak": round(float(np.max(self.nir_spectrum[30:45])), 3),  # ~1300-1500nm band
            "metal_detected": self.inductive_metal,
            "inductive_strength": round(self.inductive_strength, 3),
            "dielectric": round(self.capacitive_dielectric, 3),
        }
