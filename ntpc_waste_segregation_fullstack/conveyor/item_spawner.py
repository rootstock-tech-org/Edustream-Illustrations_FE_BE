"""
Item Spawner
==============
Generates random waste items at configurable rates and probabilities.
Supports both automatic spawning and manual spawn from UI.
"""

import uuid
import numpy as np
from sensors.item_models import WasteItem, MATERIAL_TABLE
import config


class ItemSpawner:
    """
    Generates waste items with realistic random properties.
    
    Uses the configured probability distribution to determine item types,
    and the material physics tables for realistic dimensions and masses.
    """

    def __init__(self):
        self.spawn_rate = config.SPAWN_RATE_PER_MIN  # items/min
        self._time_accumulator = 0.0
        self._item_counter = 0
        
        # Build probability distribution arrays
        self._update_probabilities()

    def _update_probabilities(self):
        """Normalize and prepare type probability arrays."""
        self.type_names = list(config.ITEM_TYPE_PROBABILITIES.keys())
        probs = np.array([config.ITEM_TYPE_PROBABILITIES[t] for t in self.type_names])
        self.type_probs = probs / probs.sum()  # normalize

    def tick(self, dt: float, belt_width: float) -> list[WasteItem]:
        """
        Check if it's time to spawn new items based on elapsed time.
        
        Args:
            dt: elapsed time in seconds
            belt_width: conveyor width in meters
        
        Returns:
            List of newly spawned WasteItem objects (may be empty).
        """
        self._time_accumulator += dt
        spawn_interval = 60.0 / max(self.spawn_rate, 1)
        
        new_items = []
        while self._time_accumulator >= spawn_interval:
            self._time_accumulator -= spawn_interval
            item = self._create_random_item(belt_width)
            new_items.append(item)
        
        return new_items

    def spawn_specific(self, item_type: str, belt_width: float) -> WasteItem:
        """
        Manually spawn a specific type of item (from UI control).
        
        Args:
            item_type: key from MATERIAL_TABLE
            belt_width: conveyor width for position randomization
        
        Returns:
            New WasteItem of the specified type.
        """
        if item_type not in MATERIAL_TABLE:
            raise ValueError(f"Unknown item type: {item_type}. "
                           f"Valid types: {list(MATERIAL_TABLE.keys())}")
        return self._create_item(item_type, belt_width)

    def update_spawn_rate(self, rate: float) -> None:
        """Update spawn rate (items per minute)."""
        self.spawn_rate = max(1, min(300, rate))

    def _create_random_item(self, belt_width: float) -> WasteItem:
        """Create a random item using the probability distribution."""
        item_type = np.random.choice(self.type_names, p=self.type_probs)
        return self._create_item(item_type, belt_width)

    def _create_item(self, item_type: str, belt_width: float) -> WasteItem:
        """
        Create a waste item with randomized physical properties
        based on the material physics tables.
        """
        mat = MATERIAL_TABLE[item_type]
        self._item_counter += 1

        # Random mass within the material's weight range
        mass = np.random.uniform(*mat.weight_range)

        # Random density within material range
        density = np.random.uniform(*mat.density_range)

        # Derive volume from mass and density
        volume = mass / density  # m³

        # Compute approximate dimensions from volume
        # Assume roughly cuboid with random aspect ratios
        aspect_w = np.random.uniform(0.8, 1.5)
        aspect_d = np.random.uniform(0.8, 1.5)
        base = volume ** (1/3)  # cube root for base dimension
        
        width = base * aspect_w
        height = base / (aspect_w * aspect_d) * 3  # height tends to be less
        depth_extent = base * aspect_d

        # Clamp to reasonable ranges
        width = np.clip(width, 0.05, 0.6)       # 5cm to 60cm
        height = np.clip(height, 0.02, 0.4)     # 2cm to 40cm
        depth_extent = np.clip(depth_extent, 0.05, 0.5)  # 5cm to 50cm

        # Random position across belt width
        margin = width / 2 + 0.05  # keep items away from belt edges
        max_offset = belt_width / 2 - margin
        position_x = np.random.uniform(-max_offset, max_offset) if max_offset > 0 else 0.0

        return WasteItem(
            id=f"item_{self._item_counter:05d}_{uuid.uuid4().hex[:6]}",
            item_type=item_type,
            position_x=position_x,
            position_y=0.0,
            width=round(width, 3),
            height=round(height, 3),
            depth_extent=round(depth_extent, 3),
            mass_kg=round(mass, 3),
        )
