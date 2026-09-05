"""
Mock Sensor Provider
=====================
Generates synthetic sensor data that closely mimics real hardware output.
Each method produces data in the exact same format as the real sensor would.

Sensor output formats:
  - RealSense D435i: depth = (480, 640) uint16 in mm; RGB = (480, 640, 3) uint8
  - NIR line scanner: (spatial_width, 128_channels) float32, range 0-1
  - HX711 load cell: float weight in kg
  - Inductive: bool detected + float signal 0-1
  - Capacitive: float dielectric 0-1
"""

import numpy as np
from scipy.ndimage import gaussian_filter
import time

from sensors.sensor_interface import SensorProvider
from sensors.item_models import (
    WasteItem,
    SensorPayload,
    MATERIAL_TABLE,
    MaterialProperties,
)
from sensors.noise import (
    add_depth_noise,
    add_nir_noise,
    add_weight_jitter,
    add_inductive_noise,
    add_capacitive_noise,
)
import config


class MockSensorProvider(SensorProvider):
    """
    Generates realistic synthetic sensor data for all five sensor types.
    Uses the material physics tables to create data that matches real-world
    sensor responses for different waste materials.
    """

    def __init__(self):
        # NIR wavelength axis (128 channels from 750nm to 2500nm)
        self.nir_wavelengths = np.linspace(
            config.NIR_WAVELENGTH_START_NM,
            config.NIR_WAVELENGTH_END_NM,
            config.NIR_CHANNELS,
        )
        # Pre-compute NIR spectral templates for each material
        self._nir_templates = self._build_nir_templates()

    def _build_nir_templates(self) -> dict[str, np.ndarray]:
        """
        Build NIR spectral signature templates for each material type.
        
        Real NIR absorption bands for organic materials:
          - C-H stretch: ~1200 nm (first overtone), ~1725 nm (combination)
          - O-H stretch: ~1400-1450 nm (first overtone), ~1900-1950 nm (combination)
          - C=O: ~2100-2200 nm
        
        Inert materials (stone, glass, metal) have flat near-zero spectra.
        """
        templates = {}
        wl = self.nir_wavelengths

        for mat_type, props in MATERIAL_TABLE.items():
            spectrum = np.zeros(config.NIR_CHANNELS, dtype=np.float32)

            # C-H bond absorption peaks
            ch_strength = np.mean(props.nir_ch_response)
            if ch_strength > 0.01:
                # First overtone C-H ~1200nm
                spectrum += ch_strength * 0.8 * np.exp(-0.5 * ((wl - 1200) / 40) ** 2)
                # Combination band C-H ~1725nm
                spectrum += ch_strength * 0.6 * np.exp(-0.5 * ((wl - 1725) / 50) ** 2)
                # Second overtone ~910nm
                spectrum += ch_strength * 0.3 * np.exp(-0.5 * ((wl - 910) / 30) ** 2)

            # O-H bond absorption peaks
            oh_strength = np.mean(props.nir_oh_response)
            if oh_strength > 0.01:
                # First overtone O-H ~1400nm
                spectrum += oh_strength * 0.9 * np.exp(-0.5 * ((wl - 1400) / 35) ** 2)
                # Combination band O-H ~1950nm
                spectrum += oh_strength * 0.7 * np.exp(-0.5 * ((wl - 1950) / 45) ** 2)

            # Normalize to 0-1 range
            if spectrum.max() > 0:
                spectrum = spectrum / spectrum.max()

            templates[mat_type] = spectrum

        return templates

    def scan_item(
        self,
        item: WasteItem,
        conveyor_speed: float,
        scan_time: float,
    ) -> SensorPayload:
        """Generate a full suite of synthetic sensor data for one item."""
        mat = MATERIAL_TABLE.get(item.item_type)
        if mat is None:
            raise ValueError(f"Unknown item type: {item.item_type}")

        # Generate each sensor reading
        depth_frame, rgb_frame = self._generate_item_frames(item, mat)
        point_cloud = self._depth_to_point_cloud(depth_frame, item)
        nir_spectrum = self._generate_nir_spectrum(item, mat)
        nir_section = self._generate_nir_section(item, mat, conveyor_speed)
        weight = self._generate_weight(item, mat)
        inductive_metal, inductive_strength = self._generate_inductive(mat)
        capacitive = self._generate_capacitive(mat)
        estimated_vol = self._estimate_volume_from_depth(depth_frame, item)

        return SensorPayload(
            item_id=item.id,
            depth_frame=depth_frame,
            rgb_frame=rgb_frame,
            point_cloud=point_cloud,
            nir_spectrum=nir_spectrum,
            nir_section_map=nir_section,
            weight_kg=weight,
            inductive_metal=inductive_metal,
            inductive_strength=inductive_strength,
            capacitive_dielectric=capacitive,
            estimated_volume_m3=estimated_vol,
            timestamp=scan_time,
        )

    def get_conveyor_depth_frame(
        self,
        items: list[WasteItem],
        belt_width: float,
        view_length: float,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Generate a full depth + RGB frame of the conveyor section.
        Multiple items may be visible simultaneously.
        """
        h, w = config.DEPTH_HEIGHT, config.DEPTH_WIDTH

        # Base conveyor surface at DEPTH_BASELINE_MM
        depth = np.full((h, w), config.DEPTH_BASELINE_MM, dtype=np.float32)
        rgb = np.full((h, w, 3), [80, 75, 70], dtype=np.uint8)  # Grey conveyor

        # Add conveyor belt texture (subtle horizontal lines)
        for row in range(0, h, 8):
            rgb[row:row+1, :] = [70, 65, 60]

        for item in items:
            mat = MATERIAL_TABLE.get(item.item_type)
            if mat is None:
                continue

            # Map item world position to pixel coordinates
            y_min = config.SCAN_ZONE_START_M - (view_length - config.SCAN_ZONE_LENGTH_M) / 2
            px_x = int((item.position_x / belt_width + 0.5) * w)
            px_y = int(((item.position_y - y_min) / view_length) * h)
            
            # Item size in pixels
            px_w = max(8, int((item.width / belt_width) * w))
            px_h_size = max(8, int((item.depth_extent / view_length) * h))

            # Bounding box
            x1 = max(0, px_x - px_w // 2)
            x2 = min(w, px_x + px_w // 2)
            y1 = max(0, px_y - px_h_size // 2)
            y2 = min(h, px_y + px_h_size // 2)

            if x2 <= x1 or y2 <= y1:
                continue

            # Create Gaussian bump for item height in depth
            region_h = y2 - y1
            region_w = x2 - x1
            yy, xx = np.meshgrid(
                np.linspace(-1, 1, region_h),
                np.linspace(-1, 1, region_w),
                indexing='ij'
            )
            # Organic irregular shape by distorting the coordinate space
            xx_dist = xx + gaussian_filter(np.random.randn(region_h, region_w) * 0.4, sigma=2)
            yy_dist = yy + gaussian_filter(np.random.randn(region_h, region_w) * 0.4, sigma=2)
            radius = np.sqrt(xx_dist**2 + yy_dist**2)
            
            # Smoothly drop off from 1.0 to 0.0 at the edges of the organic footprint
            bump = np.clip((1.0 - radius) * 4.0, 0, 1)
            
            # Add surface roughness (rugged top)
            roughness = gaussian_filter(np.random.randn(region_h, region_w) * 0.1, sigma=1)
            bump = np.clip(bump + roughness, 0, 1)
            height_mm = item.height * 1000  # convert to mm
            depth[y1:y2, x1:x2] -= (bump * height_mm).astype(np.float32)

            # RGB color for this item type
            color = np.array(mat.color_rgb, dtype=np.uint8)
            # Add some random texture variation
            texture = np.random.randint(-15, 15, (region_h, region_w, 3), dtype=np.int16)
            item_rgb = np.clip(color.astype(np.int16) + texture, 0, 255).astype(np.uint8)
            # Apply with alpha mask based on bump
            alpha = (bump > 0.1).astype(np.float32)[:, :, np.newaxis]
            existing = rgb[y1:y2, x1:x2].astype(np.float32)
            rgb[y1:y2, x1:x2] = (
                existing * (1 - alpha) + item_rgb.astype(np.float32) * alpha
            ).astype(np.uint8)

        # Add depth noise
        depth = add_depth_noise(depth.astype(np.uint16), config.DEPTH_NOISE_SIGMA)

        return depth, rgb

    def get_nir_line_scan(
        self,
        items: list[WasteItem],
        belt_width: float,
        scan_position: float,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Generate a single NIR line scan across the belt at the given position.
        Returns (line_data, wavelengths) where line_data is (spatial_pixels, channels).
        """
        spatial_w = config.NIR_LINE_WIDTH_PX
        n_channels = config.NIR_CHANNELS
        
        # Baseline: dark/noise floor
        line = np.random.uniform(0.01, 0.03, (spatial_w, n_channels)).astype(np.float32)

        for item in items:
            mat = MATERIAL_TABLE.get(item.item_type)
            if mat is None:
                continue

            # Check if item overlaps with this scan line position
            item_start_y = item.position_y - item.depth_extent / 2
            item_end_y = item.position_y + item.depth_extent / 2
            if not (item_start_y <= scan_position <= item_end_y):
                continue

            # Item spatial extent on the line
            center_px = int((item.position_x / belt_width + 0.5) * spatial_w)
            half_w_px = max(4, int((item.width / belt_width) * spatial_w / 2))
            x1 = max(0, center_px - half_w_px)
            x2 = min(spatial_w, center_px + half_w_px)

            if x2 <= x1:
                continue

            # Get material spectrum template
            template = self._nir_templates.get(item.item_type, np.zeros(n_channels))
            
            # Scale by material response with some random variation
            scale = np.random.uniform(0.7, 1.0)
            item_spectrum = template * scale

            # Apply across spatial extent with Gaussian falloff from center
            for px in range(x1, x2):
                dist_from_center = abs(px - center_px) / max(half_w_px, 1)
                spatial_weight = np.exp(-dist_from_center**2 * 2)
                line[px, :] += item_spectrum * spatial_weight

        # Add NIR noise
        line = add_nir_noise(line, config.NIR_SNR_DB)

        return line, self.nir_wavelengths

    def get_sensor_streams(self, items: list, belt_width: float, scan_zone_start: float, scan_zone_length: float, sim_time: float) -> dict:
        """Generate continuous raw sensor streams for the current timestamp."""
        # 1. Full 2D Depth map of the scan zone
        depth_frame, rgb_frame = self.get_conveyor_depth_frame(items, belt_width, scan_zone_length)
        
        # 2. 1D NIR Line scan (located at the center of the scan zone)
        nir_line_y = scan_zone_start + scan_zone_length / 2
        nir_line, _ = self.get_nir_line_scan(items, belt_width, nir_line_y)
        
        # 3. Load cell and Inductive (analog values at their physical locations)
        # Load cell is at scan_zone_start + 0.2, Inductive is at scan_zone_start + 0.4
        weight = 0.0
        inductive_str = 0.0
        metal = False
        
        for item in items:
            mat = MATERIAL_TABLE.get(item.item_type)
            if not mat: continue
            
            # Check weight
            if item.position_y - item.depth_extent/2 <= scan_zone_start + 0.2 <= item.position_y + item.depth_extent/2:
                weight += item.mass_kg + np.random.normal(0, config.LOADCELL_NOISE_SIGMA_KG)
                
            # Check inductive
            if item.position_y - item.depth_extent/2 <= scan_zone_start + 0.4 <= item.position_y + item.depth_extent/2:
                m_flag, m_str = self._generate_inductive(mat)
                if m_flag: metal = True
                inductive_str = max(inductive_str, m_str)
                
        return {
            "depth_frame": depth_frame,
            "rgb_frame": rgb_frame,
            "nir_line": nir_line,
            "weight_kg": max(0.0, weight),
            "inductive_metal": metal,
            "inductive_strength": inductive_str,
            "timestamp": sim_time
        }

    # ─── Private generation methods ──────────────────────────────────

    def _generate_item_frames(
        self, item: WasteItem, mat: MaterialProperties
    ) -> tuple[np.ndarray, np.ndarray]:
        """Generate depth and RGB frames for a single item (cropped view)."""
        h, w = config.DEPTH_HEIGHT, config.DEPTH_WIDTH

        # Base conveyor surface
        depth = np.full((h, w), config.DEPTH_BASELINE_MM, dtype=np.float32)
        rgb = np.full((h, w, 3), [80, 75, 70], dtype=np.uint8)

        # Place item based on its actual physical position X on the belt
        # X: -belt_width/2 to +belt_width/2
        cx = int((item.position_x / config.CONVEYOR_WIDTH_M + 0.5) * w)
        cy = h // 2  # Y is centered in the scan snapshot view
        
        item_w_px = max(20, int((item.width / config.CONVEYOR_WIDTH_M) * w))
        item_h_px = max(20, int((item.depth_extent / config.SCAN_ZONE_LENGTH_M) * h))

        x1 = max(0, cx - item_w_px // 2)
        x2 = min(w, cx + item_w_px // 2)
        y1 = max(0, cy - item_h_px // 2)
        y2 = min(h, cy + item_h_px // 2)

        region_h = y2 - y1
        region_w = x2 - x1

        if region_h > 0 and region_w > 0:
            yy, xx = np.meshgrid(
                np.linspace(-1, 1, region_h),
                np.linspace(-1, 1, region_w),
                indexing='ij'
            )
            # Organic irregular shape by distorting the coordinate space
            xx_dist = xx + gaussian_filter(np.random.randn(region_h, region_w) * 0.4, sigma=2)
            yy_dist = yy + gaussian_filter(np.random.randn(region_h, region_w) * 0.4, sigma=2)
            radius = np.sqrt(xx_dist**2 + yy_dist**2)
            
            bump = np.clip((1.0 - radius) * 4.0, 0, 1)
            roughness = gaussian_filter(np.random.randn(region_h, region_w) * 0.1, sigma=1)
            bump = np.clip(bump + roughness, 0, 1)

            height_mm = item.height * 1000
            depth[y1:y2, x1:x2] -= (bump * height_mm).astype(np.float32)

            # RGB with texture
            color = np.array(mat.color_rgb, dtype=np.int16)
            texture = np.random.randint(-20, 20, (region_h, region_w, 3), dtype=np.int16)
            item_rgb = np.clip(color + texture, 0, 255).astype(np.uint8)
            
            alpha = (bump > 0.15)[:, :, np.newaxis].astype(np.float32)
            existing = rgb[y1:y2, x1:x2].astype(np.float32)
            rgb[y1:y2, x1:x2] = (
                existing * (1 - alpha) + item_rgb.astype(np.float32) * alpha
            ).astype(np.uint8)

        depth = add_depth_noise(depth.astype(np.uint16), config.DEPTH_NOISE_SIGMA)
        return depth, rgb

    def _depth_to_point_cloud(
        self, depth_frame: np.ndarray, item: WasteItem
    ) -> np.ndarray:
        """
        Convert depth frame to 3D point cloud using D435i camera intrinsics.
        
        Uses the pinhole camera model:
            X = (u - cx) * Z / fx
            Y = (v - cy) * Z / fy
            Z = depth[v, u] / 1000  (mm → m)
        """
        h, w = depth_frame.shape
        
        # Sub-sample for performance (every 4th pixel)
        step = 4
        v_coords, u_coords = np.meshgrid(
            np.arange(0, h, step), np.arange(0, w, step), indexing='ij'
        )
        
        depths = depth_frame[v_coords, u_coords].astype(np.float32) / 1000.0  # mm → m
        
        # Filter out zero-depth (dead) pixels
        valid = depths > 0.1
        
        z = depths[valid]
        u = u_coords[valid].astype(np.float32)
        v = v_coords[valid].astype(np.float32)
        
        x = (u - config.D435I_CX) * z / config.D435I_FX
        y = (v - config.D435I_CY) * z / config.D435I_FY
        
        points = np.stack([x, y, z], axis=-1).astype(np.float32)
        return points

    def _generate_nir_spectrum(
        self, item: WasteItem, mat: MaterialProperties
    ) -> np.ndarray:
        """Generate a single NIR spectrum for an item based on its material."""
        template = self._nir_templates.get(item.item_type, np.zeros(config.NIR_CHANNELS))
        
        # Massive random scaling within material's response range to introduce confusion
        ch_scale = np.random.uniform(*mat.nir_ch_response) * np.random.uniform(0.4, 1.6)
        oh_scale = np.random.uniform(*mat.nir_oh_response) * np.random.uniform(0.4, 1.6)
        
        # Apply material-specific scaling
        spectrum = template.copy()
        if template.max() > 0:
            # Scale the overall intensity
            avg_response = (ch_scale + oh_scale) / 2
            spectrum = spectrum * avg_response / template.max() if template.max() > 0 else spectrum
        
        spectrum = add_nir_noise(spectrum, config.NIR_SNR_DB)
        return spectrum

    def _generate_nir_section(
        self, item: WasteItem, mat: MaterialProperties, conveyor_speed: float
    ) -> np.ndarray:
        """
        Generate a 2D NIR section map by simulating multiple line scans
        as the item passes under the line scanner.
        
        The number of lines depends on item size and conveyor speed.
        """
        # How many scan lines does this item occupy?
        scan_time = item.depth_extent / max(conveyor_speed, 0.01)
        n_lines = max(4, int(scan_time * config.NIR_SCAN_RATE_HZ))
        n_lines = min(n_lines, 64)  # cap for performance

        section = np.zeros((n_lines, config.NIR_CHANNELS), dtype=np.float32)
        template = self._nir_templates.get(item.item_type, np.zeros(config.NIR_CHANNELS))

        for i in range(n_lines):
            # Position along item (front to back)
            t = i / max(n_lines - 1, 1)
            # Spatial profile: items are typically strongest in the middle
            spatial_weight = np.exp(-(t - 0.5)**2 * 8)
            
            line_spectrum = template * spatial_weight * np.random.uniform(0.7, 1.0)
            section[i, :] = add_nir_noise(line_spectrum, config.NIR_SNR_DB)

        return section

    def _generate_weight(self, item: WasteItem, mat: MaterialProperties) -> float:
        """Generate a load cell weight reading for the item."""
        base_mass = item.mass_kg
        
        # INJECTING SENSOR FAILURES: 20% chance the load cell reading glitches massively
        # This causes the density calculation in feature_extractor to spike or plummet,
        # forcing the Random Forest to occasionally make False Positives and False Negatives!
        if np.random.random() < 0.20:
            base_mass *= np.random.uniform(0.1, 4.0)
            
        return add_weight_jitter(base_mass, config.LOADCELL_NOISE_SIGMA_KG)

    def _generate_inductive(
        self, mat: MaterialProperties
    ) -> tuple[bool, float]:
        """Generate inductive sensor reading based on metal presence."""
        if mat.metal_present:
            base_strength = np.random.uniform(0.4, 0.95) * np.random.uniform(0.5, 1.5)
        else:
            base_strength = np.random.uniform(0.0, 0.3)

        return add_inductive_noise(
            mat.metal_present,
            base_strength,
            config.INDUCTIVE_FALSE_POS_RATE,
        )

    def _generate_capacitive(self, mat: MaterialProperties) -> float:
        """Generate capacitive dielectric reading."""
        base = np.random.uniform(*mat.dielectric_range) * np.random.uniform(0.6, 1.4)
        return add_capacitive_noise(base, config.CAPACITIVE_NOISE_SIGMA)

    def _estimate_volume_from_depth(
        self, depth_frame: np.ndarray, item: WasteItem
    ) -> float:
        """
        Estimate item volume from the depth frame by computing the
        integral of height above the conveyor surface.
        
        This mimics how a real system would estimate volume:
        sum of (baseline - depth) for all pixels where depth < baseline,
        converted to cubic meters using the camera's spatial resolution.
        """
        baseline = config.DEPTH_BASELINE_MM
        height_map = baseline - depth_frame.astype(np.float32)
        height_map = np.clip(height_map, 0, None)

        # Only count pixels with significant height
        mask = height_map > 5  # 5mm threshold
        if not mask.any():
            return 0.001  # Minimum measurable volume if sensor completely fails

        # Pixel area in m² (approximate, using camera intrinsics at baseline distance)
        z_m = baseline / 1000.0
        px_width_m = z_m / config.D435I_FX
        px_height_m = z_m / config.D435I_FY
        px_area_m2 = px_width_m * px_height_m

        # Volume = sum of (pixel_area × height_in_meters)
        total_height_m = height_map[mask].sum() / 1000.0  # mm → m
        volume = total_height_m * px_area_m2

        return volume

    def initialize(self) -> None:
        """No-op for mock provider."""
        pass

    def shutdown(self) -> None:
        """No-op for mock provider."""
        pass
