"""
Conveyor Map
=============
Tracks the spatial state of the conveyor belt and all items on it.
Manages item lifecycle: spawned → scanning → classified → diverted/passed.
"""

import time
from typing import Optional
from sensors.item_models import WasteItem
import config


class ConveyorMap:
    """
    Spatial state manager for the conveyor belt.
    
    The belt is modeled as a 2D surface:
      - X axis: across the belt width (centered at 0)
      - Y axis: along belt travel direction (0 = entry, belt_length = exit)
    
    Key zones along Y:
      - [0, scan_zone_start]: items moving toward sensors
      - [scan_zone_start, scan_zone_start + scan_zone_length]: SCAN ZONE
      - [diverter_pos - 0.1, diverter_pos + 0.1]: DIVERTER GATE
      - [belt_length, ...]: items fall off the end
    """

    def __init__(self):
        self.belt_width: float = config.CONVEYOR_WIDTH_M
        self.belt_length: float = config.CONVEYOR_LENGTH_M
        self.speed: float = config.CONVEYOR_SPEED_MS
        
        # Zone positions (along Y axis)
        self.scan_zone_start: float = config.SCAN_ZONE_START_M
        self.scan_zone_end: float = config.SCAN_ZONE_START_M + config.SCAN_ZONE_LENGTH_M
        self.diverter_pos: float = config.DIVERTER_GATE_POS_M
        
        # Active items on the belt
        self.items: dict[str, WasteItem] = {}
        
        # Counters
        self.total_spawned: int = 0
        self.total_passed: int = 0
        self.total_diverted: int = 0
        self.sim_time: float = 0.0

    def tick(self, dt: float) -> dict:
        """
        Advance the simulation by dt seconds.
        
        - Moves all items forward by speed * dt
        - Updates item states based on zone positions
        - Removes items that have passed the belt end
        
        Returns:
            Event dict with lists of items that changed state.
        """
        self.sim_time += dt
        
        events = {
            "entered_scan_zone": [],
            "left_scan_zone": [],
            "reached_diverter": [],
            "exited_belt": [],
        }
        
        to_remove = []
        
        import random
        
        for item_id, item in self.items.items():
            old_y = item.position_y
            # Add jitter to speed (±15% variation)
            jitter = random.uniform(-0.15, 0.15) * self.speed
            actual_speed = max(0.01, self.speed + jitter)
            item.position_y += actual_speed * dt
            new_y = item.position_y
            
            # Check zone transitions
            if old_y < self.scan_zone_start <= new_y:
                item.state = "scanning"
                events["entered_scan_zone"].append(item_id)
            
            if old_y < self.scan_zone_end <= new_y and item.state == "scanning":
                # If not yet classified, mark as passed scan zone
                if item.decision is None:
                    item.state = "unclassified"
                events["left_scan_zone"].append(item_id)
            
            # Diverter gate
            if old_y < self.diverter_pos <= new_y:
                if item.decision == "HAZARD":
                    item.state = "diverted"
                    self.total_diverted += 1
                    events["reached_diverter"].append(item_id)
                else:
                    item.state = "passing"
            
            # Past the belt end
            if new_y > self.belt_length:
                if item.state != "diverted":
                    self.total_passed += 1
                to_remove.append(item_id)
                events["exited_belt"].append(item_id)
        
        # Remove exited items
        for item_id in to_remove:
            del self.items[item_id]
        
        return events

    def spawn_item(self, item: WasteItem) -> None:
        """Place an item at the belt entry point."""
        item.position_y = 0.0
        item.spawn_time = self.sim_time
        self.items[item.id] = item
        self.total_spawned += 1

    def get_scan_zone_items(self) -> list[WasteItem]:
        """Return all items currently within the scan zone."""
        return [
            item for item in self.items.values()
            if self.scan_zone_start <= item.position_y <= self.scan_zone_end
            and item.state in ("scanning", "spawned")
        ]

    def get_visible_items(self, y_start: float = 0.0, y_end: float = None) -> list[WasteItem]:
        """Return all items within a Y range (for camera field of view)."""
        y_end = y_end or self.belt_length
        return [
            item for item in self.items.values()
            if y_start <= item.position_y <= y_end
        ]

    def get_item(self, item_id: str) -> Optional[WasteItem]:
        """Get a specific item by ID."""
        return self.items.get(item_id)

    def update_item_decision(
        self, item_id: str, decision: str, confidence: float,
        hazard_type: str = None, reasoning: str = "",
    ) -> None:
        """Update an item's classification result."""
        item = self.items.get(item_id)
        if item:
            item.decision = decision
            item.confidence = confidence
            item.hazard_type = hazard_type
            item.reasoning = reasoning
            item.state = "classified"

    def update_speed(self, speed: float) -> None:
        """Update conveyor belt speed (m/s)."""
        self.speed = max(0.1, min(1.5, speed))

    def get_state(self) -> dict:
        """Serialize full conveyor state for WebSocket emission."""
        return {
            "belt_width": self.belt_width,
            "belt_length": self.belt_length,
            "speed": round(self.speed, 2),
            "sim_time": round(self.sim_time, 2),
            "scan_zone": {
                "start": self.scan_zone_start,
                "end": self.scan_zone_end,
            },
            "diverter_pos": self.diverter_pos,
            "items": [item.to_dict() for item in list(self.items.values())],
            "stats": {
                "total_spawned": self.total_spawned,
                "total_passed": self.total_passed,
                "total_diverted": self.total_diverted,
                "active_on_belt": len(self.items),
            },
        }
