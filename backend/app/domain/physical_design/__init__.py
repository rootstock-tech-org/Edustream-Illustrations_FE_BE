"""Physical-design domain (Step 19): the real LibreLane + SKY130 physical
implementation pipeline. Takes a Canonical IR document, generates real HDL
via the EXISTING Step 18 generator, runs the actual LibreLane/OpenROAD/
Magic toolchain, and reconstructs an honest mapping back to canonical IR
component/port ids from the resulting real DEF. Connection-level identity
is always reported unavailable - never guessed. Never a second, competing
identity system; the original Canonical IR remains authoritative.
"""

from app.domain.physical_design.models import (
    ArtifactMetadata,
    CellClassification,
    ComponentPhysicalMapping,
    ConnectionIdentityStatus,
    FailureCode,
    JobStatus,
    PhysicalDesignError,
    PhysicalDesignJob,
    PhysicalDesignResult,
    PhysicalIdentityMapping,
    PortPhysicalMapping,
    SignoffStatus,
    UnmappedCell,
)
from app.domain.physical_design.pipeline import run_physical_design

__all__ = [
    "ArtifactMetadata",
    "CellClassification",
    "ComponentPhysicalMapping",
    "ConnectionIdentityStatus",
    "FailureCode",
    "JobStatus",
    "PhysicalDesignError",
    "PhysicalDesignJob",
    "PhysicalDesignResult",
    "PhysicalIdentityMapping",
    "PortPhysicalMapping",
    "SignoffStatus",
    "UnmappedCell",
    "run_physical_design",
]
