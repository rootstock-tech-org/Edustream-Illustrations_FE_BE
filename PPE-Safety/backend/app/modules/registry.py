"""
Module registry.

Single place where monitoring modules are registered. `main.py` walks this
registry to mount one API router per module, so adding a capability means
adding one `register()` call here — no changes to routing, streaming, or any
shared code.

Registration order is preserved and is the order modules appear in the API's
module list (and therefore the sidebar).
"""

from typing import Iterator

from app.modules.base import BaseMonitoringService

_REGISTRY: dict[str, BaseMonitoringService] = {}


def register(service: BaseMonitoringService) -> BaseMonitoringService:
    """
    Add a service to the registry.

    Args:
        service: an instantiated monitoring service.

    Returns:
        The same service, so this can be used inline at module scope.

    Raises:
        ValueError: if `module_id` is empty or already registered. Both are
            programming errors — a duplicate id would silently shadow a module
            and mount two routers on the same path.
    """
    module_id = service.module_id

    if not module_id:
        raise ValueError(
            f"{type(service).__name__} must define a non-empty module_id"
        )

    if module_id in _REGISTRY:
        raise ValueError(
            f"Module id '{module_id}' is already registered by "
            f"{type(_REGISTRY[module_id]).__name__}"
        )

    _REGISTRY[module_id] = service

    return service


def get_service(module_id: str) -> BaseMonitoringService:
    """
    Look up a registered service.

    Raises:
        KeyError: if no module with that id is registered.
    """
    if module_id not in _REGISTRY:
        raise KeyError(
            f"Unknown module '{module_id}'. "
            f"Registered: {', '.join(sorted(_REGISTRY)) or 'none'}"
        )

    return _REGISTRY[module_id]


def has_service(module_id: str) -> bool:
    """Whether a module is registered."""
    return module_id in _REGISTRY


def list_services() -> list[BaseMonitoringService]:
    """All registered services, in registration order."""
    return list(_REGISTRY.values())


def list_module_ids() -> list[str]:
    """All registered module ids, in registration order."""
    return list(_REGISTRY)


def reset_all() -> None:
    """
    Tell every module the camera has changed.

    Everything a module holds is about the picture it was watching: a drawn
    area, a door's open timer, the latest figures. Point the system at a
    different camera and none of it applies any more — but nothing used to
    call this, so an area drawn on one video stayed active over the next one,
    and a door recorded as open for 40 seconds carried its timer across.

    One misbehaving module must not stop the others being reset.
    """
    for service in _REGISTRY.values():
        try:
            service.reset()
        except Exception as exc:  # noqa: BLE001
            print(f"[registry] {service.module_id} failed to reset: {exc}")


def __iter__() -> Iterator[BaseMonitoringService]:  # pragma: no cover
    return iter(_REGISTRY.values())
