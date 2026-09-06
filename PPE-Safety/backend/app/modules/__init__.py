"""
Monitoring modules.

Importing this package registers every available module. `main.py` then walks
the registry and mounts one router per module.

To add a capability:

    1. create app/modules/<name>/service.py with a BaseMonitoringService subclass
    2. import and register() it below
    3. add a matching entry to the frontend module registry

Nothing else needs to change — routing, streaming, and the module list are
generated from the registry.
"""

from app.modules import registry
from app.modules.base import BaseMonitoringService
from app.modules.door.service import service as door_service
from app.modules.face.service import service as face_service
from app.modules.gloves.service import service as gloves_service
from app.modules.mask.service import service as mask_service
from app.modules.ppe.service import service as ppe_service
from app.modules.restricted_zone.service import service as restricted_zone_service
from app.modules.vehicle_zone.service import service as vehicle_zone_service
from app.modules.walkways.service import service as walkways_service
from app.modules.suspended_load.service import service as suspended_load_service
from app.modules.workstation.service import service as workstation_service

registry.register(restricted_zone_service)
registry.register(ppe_service)
registry.register(gloves_service)
registry.register(mask_service)
registry.register(face_service)
registry.register(workstation_service)
registry.register(door_service)
registry.register(vehicle_zone_service)
registry.register(walkways_service)
registry.register(suspended_load_service)

__all__ = [
    "BaseMonitoringService",
    "registry",
]
