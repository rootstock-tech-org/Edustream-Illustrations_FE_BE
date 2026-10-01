"""app.domain.identity - the canonical cross-layer identity/provenance
package.

This is the ONE place a caller goes to ask "what does canonical component
X correspond to across every representation this platform can actually
produce (HDL instance, physical placed cell, DEF pin)?" - never a
per-view, disconnected re-derivation of the same question.

Deliberately built ADDITIVELY on top of existing, already-real data
(app.domain.hdl.generator.HdlModule, app.domain.physical_design's
PhysicalIdentityMapping) rather than replacing them - this package only
PROJECTS that existing data into one unified, explicit ledger. See
builder.py's module docstring for the exact aggregation rules and honesty
guarantees.
"""
