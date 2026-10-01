"""A small, static, publicly-documented SKY130 PDK GDS layer/datatype
naming reference table.

This is NOT derived from any specific GDS file - it is the SAME
industry-standard (layer, datatype) -> name mapping SkyWater publishes for
the SKY130 PDK (independently verified against a real installed PDK's own
`.lyp` technology file in prior work on this same GDS toolchain). Used
ONLY as a best-effort DISPLAY aid in the GDS viewer; a (layer, datatype)
pair not present here is shown as `None` (falls back to a raw "L{layer}/
D{datatype}" label in the frontend) - never guessed.
"""

from __future__ import annotations

SKY130_GDS_LAYER_NAMES: dict[tuple[int, int], str] = {
    (64, 20): "nwell",
    (65, 20): "diff",
    (66, 20): "poly",
    (66, 44): "licon1",
    (67, 20): "li1",
    (67, 44): "mcon",
    (68, 20): "met1",
    (68, 44): "via",
    (69, 20): "met2",
    (69, 44): "via2",
    (70, 20): "met3",
    (70, 44): "via3",
    (71, 20): "met4",
    (71, 44): "via4",
    (72, 20): "met5",
}


def known_layer_name(layer: int, datatype: int) -> str | None:
    return SKY130_GDS_LAYER_NAMES.get((layer, datatype))
