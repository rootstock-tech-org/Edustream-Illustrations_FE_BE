"""
Sensor Provider Interface
==========================
Abstract base class defining the contract for all sensor data providers.
Implement this interface for:
  - MockSensorProvider (synthetic data — current)
  - RealSensorProvider (pyrealsense2 + GPIO — future hardware)
"""

from abc import ABC, abstractmethod
from sensors.item_models import WasteItem, SensorPayload


class SensorProvider(ABC):
    """
    Abstract sensor provider interface.
    
    When physical hardware is available, create a new class that inherits
    from this and implements all methods using real sensor drivers:
    
        from sensors.sensor_interface import SensorProvider
        import pyrealsense2 as rs
        
        class RealSensorProvider(SensorProvider):
            def __init__(self):
                self.pipeline = rs.pipeline()
                ...
            
            def scan_item(self, item, conveyor_speed, scan_time):
                # Read real sensor data
                frames = self.pipeline.wait_for_frames()
                depth = frames.get_depth_frame()
                ...
    
    Then in config.py, set USE_MOCK_SENSORS = False and update app.py
    to instantiate RealSensorProvider instead.
    """

    @abstractmethod
    def scan_item(
        self,
        item: WasteItem,
        conveyor_speed: float,
        scan_time: float,
    ) -> SensorPayload:
        """
        Perform a full sensor scan of an item on the conveyor.
        
        Args:
            item: The waste item to scan (position, dimensions, type).
            conveyor_speed: Current belt speed in m/s.
            scan_time: Current simulation timestamp.
        
        Returns:
            SensorPayload containing all sensor readings for this item.
        """
        ...

    @abstractmethod
    def get_conveyor_depth_frame(
        self,
        items: list[WasteItem],
        belt_width: float,
        view_length: float,
    ):
        """
        Generate a full depth frame of the conveyor section visible to the camera.
        
        Args:
            items: All items currently in the camera's field of view.
            belt_width: Width of conveyor in meters.
            view_length: Length of conveyor visible in meters.
        
        Returns:
            (depth_frame, rgb_frame) tuple of numpy arrays.
        """
        ...

    @abstractmethod
    def get_nir_line_scan(
        self,
        items: list[WasteItem],
        belt_width: float,
        scan_position: float,
    ):
        """
        Get a single NIR line scan across the belt width at a given position.
        
        Args:
            items: Items near the scan line.
            belt_width: Width of conveyor in meters.
            scan_position: Y-position along belt where scanner is mounted.
        
        Returns:
            (line_spectrum, wavelengths) — (W, C) spectral data and wavelength axis.
        """
        ...

    def initialize(self) -> None:
        """Optional initialization (open connections, warm up sensors)."""
        pass

    def shutdown(self) -> None:
        """Optional cleanup (close connections, release resources)."""
        pass
