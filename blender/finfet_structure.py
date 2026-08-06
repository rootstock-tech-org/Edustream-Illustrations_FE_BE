"""
FinFET STRUCTURE — a clean, textbook-style labeled 3D illustration (Blender)
====================================================================================
Matches the classic FinFET 3D reference: a grey silicon substrate, a thin
orange gate-oxide layer, a tall thin silicon FIN running source→drain, and a
blue GATE that wraps over the middle of the fin on three sides. Every part is
called out with a camera-facing label + leader line, plus the three signature
dimensions: Fin Width, Fin Height and Gate Length.

Companion to mosfet_structure.py — same helper style / material system, a
single static/turntable labeled device.

HOW TO RENDER
-------------
GUI:   Blender > Scripting tab > Open this file > Run Script.
       Then: Render menu > Render Animation  (Ctrl+F12).
CLI:   blender --background --python blender/finfet_structure.py -- --render

Output: an MP4 lands on your Desktop as  finfet_structure_*.mp4
Tested against Blender 3.6 – 4.2. Uses Eevee for practical render times.
"""

import bpy
import os
import math
from mathutils import Vector

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
FPS = 30
DURATION_S = 4.0
RES_X, RES_Y = 1920, 1080
OUT_DIR = os.path.join(os.path.expanduser("~"), "Desktop")
OUT_NAME = "finfet_structure_"
START = 1
END = START + int(DURATION_S * FPS)


# ─────────────────────────────────────────────────────────────────────────────
# MATERIALS
# ─────────────────────────────────────────────────────────────────────────────
def rgb(hexs):
    h = hexs.lstrip("#")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0, 1.0)


def set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            try:
                node.inputs[n].default_value = value
                return True
            except Exception:
                pass
    return False


def mat(name, color, metallic=0.1, rough=0.55, alpha=1.0, emis=None, emis_str=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        for nn in nt.nodes:
            if nn.type == "BSDF_PRINCIPLED":
                bsdf = nn
                break
    set_input(bsdf, ["Base Color"], rgb(color))
    set_input(bsdf, ["Metallic"], metallic)
    set_input(bsdf, ["Roughness"], rough)
    set_input(bsdf, ["Alpha"], alpha)
    if emis is not None:
        set_input(bsdf, ["Emission Color", "Emission"], rgb(emis))
        set_input(bsdf, ["Emission Strength"], emis_str)
    if alpha < 1.0:
        m.blend_method = "BLEND"
    return m


MAT = {
    "substrate": mat("fin_substrate", "#9aa3ad", 0.1, 0.6),        # grey silicon substrate
    "fin": mat("fin_silicon", "#b8c0c8", 0.12, 0.45),             # silicon fin (source/drain body)
    "oxide": mat("fin_oxide", "#f0a53a", 0.05, 0.4),              # gate oxide — orange, like the reference
    "gate": mat("fin_gate", "#3b7fd4", 0.2, 0.35),               # gate — blue, wraps the fin
    "leader": mat("fin_leader", "#222222", 0.0, 0.6, emis="#222222", emis_str=0.5),
    "label": mat("fin_label", "#ffffff", 0.0, 0.5, emis="#ffffff", emis_str=1.2),
}

# ─────────────────────────────────────────────────────────────────────────────
# SCENE RESET
# ─────────────────────────────────────────────────────────────────────────────
scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)


# ─────────────────────────────────────────────────────────────────────────────
# GEOMETRY BUILDERS
# ─────────────────────────────────────────────────────────────────────────────
def _bevel(o, width):
    mod = o.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = 2
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(35)


def box(name, x0, x1, y0, y1, z0, z1, m, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.data.materials.append(m)
    if bevel > 0:
        _bevel(o, bevel)
    return o


def leader(name, p0, p1, m, radius=0.016):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    length = d.length
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=1, vertices=8, location=(p0 + p1) / 2)
    o = bpy.context.active_object
    o.name = name
    o.scale.z = max(length, 1e-4)
    if length > 1e-6:
        o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    o.data.materials.append(m)
    return o


def label(name, text, pos, size=0.3):
    t = bpy.data.curves.new(name, "FONT")
    t.body = text
    t.size = size
    t.extrude = 0.015
    t.align_x = "CENTER"
    o = bpy.data.objects.new(name, t)
    o.location = pos
    o.data.materials.append(MAT["label"])
    scene.collection.objects.link(o)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# BUILD THE DEVICE  (X = fin width, Y = source→drain length, Z = up)
# ─────────────────────────────────────────────────────────────────────────────
FIN_HW = 0.28                          # half fin WIDTH (X)
FIN_LEN = 2.4                          # half fin LENGTH (Y) — source..drain
FIN_TOP = 1.25                         # fin HEIGHT (Z)
OX_TOP = 0.12                          # oxide layer top (Z)
SUB_BOT = -1.1                         # substrate bottom
SUB_HALF = 2.9                         # substrate half-footprint

GATE_HL = 0.7                          # half gate LENGTH along the fin (Y)
GATE_HW = 0.95                         # half gate width (X) — overhangs the fin
GATE_TOP = 1.72                        # gate top (Z) — sits above the fin

# grey silicon substrate
box("substrate", -SUB_HALF, SUB_HALF, -SUB_HALF, SUB_HALF, SUB_BOT, 0.0, MAT["substrate"], bevel=0.04)

# orange gate-oxide layer covering the substrate top
box("oxide", -SUB_HALF, SUB_HALF, -SUB_HALF, SUB_HALF, 0.0, OX_TOP, MAT["oxide"], bevel=0.01)

# silicon fin standing up, running the full source→drain length
box("fin", -FIN_HW, FIN_HW, -FIN_LEN, FIN_LEN, OX_TOP, FIN_TOP, MAT["fin"], bevel=0.02)

# blue gate wrapping over the middle of the fin (three sides)
box("gate", -GATE_HW, GATE_HW, -GATE_HL, GATE_HL, OX_TOP, GATE_TOP, MAT["gate"], bevel=0.03)

# ─────────────────────────────────────────────────────────────────────────────
# LABELS + LEADER LINES + DIMENSIONS
# ─────────────────────────────────────────────────────────────────────────────
# Gate
GATE_LBL = Vector((-GATE_HW - 1.1, 0, GATE_TOP + 0.2))
leader("leader_gate", GATE_LBL + Vector((0.3, 0, 0)), Vector((-GATE_HW, 0, GATE_TOP * 0.7)), MAT["leader"])
label("lbl_gate", "Gate", GATE_LBL, 0.3)

# Source (fin +Y end) / Drain (fin -Y end)
SRC_LBL = Vector((0, FIN_LEN + 0.9, FIN_TOP * 0.6))
leader("leader_source", SRC_LBL + Vector((0, -0.3, 0)), Vector((0, FIN_LEN, FIN_TOP * 0.6)), MAT["leader"])
label("lbl_source", "Source", SRC_LBL, 0.28)

DRN_LBL = Vector((0, -FIN_LEN - 0.9, FIN_TOP * 0.6))
leader("leader_drain", DRN_LBL + Vector((0, 0.3, 0)), Vector((0, -FIN_LEN, FIN_TOP * 0.6)), MAT["leader"])
label("lbl_drain", "Drain", DRN_LBL, 0.28)

# Oxide
OX_LBL = Vector((SUB_HALF + 1.0, -SUB_HALF + 0.6, OX_TOP + 0.05))
leader("leader_oxide", OX_LBL + Vector((-0.3, 0, 0)), Vector((SUB_HALF - 0.1, -SUB_HALF + 0.6, OX_TOP / 2)), MAT["leader"])
label("lbl_oxide", "Oxide", OX_LBL, 0.26)

# Silicon Substrate
SUB_LBL = Vector((SUB_HALF + 1.2, SUB_HALF - 0.6, SUB_BOT * 0.5))
leader("leader_sub", SUB_LBL + Vector((-0.3, 0, 0)), Vector((SUB_HALF - 0.1, SUB_HALF - 0.6, SUB_BOT * 0.5)), MAT["leader"])
label("lbl_sub", "Silicon Substrate", SUB_LBL, 0.26)

# Fin Width (X) — dimension across the fin thickness, called out on the exposed end
FW_Z = FIN_TOP + 0.35
leader("leader_fw_l", Vector((-FIN_HW, FIN_LEN, FIN_TOP)), Vector((-FIN_HW, FIN_LEN, FW_Z)), MAT["leader"], radius=0.011)
leader("leader_fw_r", Vector((FIN_HW, FIN_LEN, FIN_TOP)), Vector((FIN_HW, FIN_LEN, FW_Z)), MAT["leader"], radius=0.011)
leader("leader_fw_span", Vector((-FIN_HW, FIN_LEN, FW_Z)), Vector((FIN_HW, FIN_LEN, FW_Z)), MAT["leader"], radius=0.011)
label("lbl_fw", "Fin Width", Vector((0, FIN_LEN + 0.2, FW_Z + 0.3)), 0.24)

# Fin Height (Z) — dimension up the exposed fin end
FH_X = FIN_HW + 0.45
leader("leader_fh_b", Vector((FIN_HW, FIN_LEN, OX_TOP)), Vector((FH_X, FIN_LEN, OX_TOP)), MAT["leader"], radius=0.011)
leader("leader_fh_t", Vector((FIN_HW, FIN_LEN, FIN_TOP)), Vector((FH_X, FIN_LEN, FIN_TOP)), MAT["leader"], radius=0.011)
leader("leader_fh_span", Vector((FH_X, FIN_LEN, OX_TOP)), Vector((FH_X, FIN_LEN, FIN_TOP)), MAT["leader"], radius=0.011)
label("lbl_fh", "Fin Height", Vector((FH_X + 0.9, FIN_LEN, (OX_TOP + FIN_TOP) / 2)), 0.24)

# Gate Length (Y) — dimension along the fin under the gate
GL_Z = GATE_TOP + 0.35
leader("leader_gl_f", Vector((GATE_HW, GATE_HL, GATE_TOP)), Vector((GATE_HW, GATE_HL, GL_Z)), MAT["leader"], radius=0.011)
leader("leader_gl_b", Vector((GATE_HW, -GATE_HL, GATE_TOP)), Vector((GATE_HW, -GATE_HL, GL_Z)), MAT["leader"], radius=0.011)
leader("leader_gl_span", Vector((GATE_HW, GATE_HL, GL_Z)), Vector((GATE_HW, -GATE_HL, GL_Z)), MAT["leader"], radius=0.011)
label("lbl_gl", "Gate Length", Vector((GATE_HW + 1.2, 0, GL_Z + 0.2)), 0.24)

# ─────────────────────────────────────────────────────────────────────────────
# WORLD + LIGHTS + GROUND
# ─────────────────────────────────────────────────────────────────────────────
world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = rgb("#0a111d")
    bg.inputs[1].default_value = 0.35


def add_light(name, kind, loc, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == "AREA":
        ld.size = 20
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    scene.collection.objects.link(o)
    return o


key = add_light("Key", "AREA", (14, -18, 22), 3500, (1.0, 0.98, 0.95))
key.rotation_euler = (math.radians(52), 0, math.radians(35))
add_light("Fill", "AREA", (-18, -8, 12), 1200, (0.75, 0.82, 1.0))
add_light("Rim", "AREA", (0, 20, 10), 1500, (1.0, 0.9, 0.75))

bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, SUB_BOT - 0.08))
ground = bpy.context.active_object
ground.name = "ground"
ground.data.materials.append(mat("fin_ground", "#0c1524", 0.0, 0.9))

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA  (gentle turntable, aiming at the device)
# ─────────────────────────────────────────────────────────────────────────────
target = bpy.data.objects.new("CamTarget", None)
target.location = (0, 0, 0.4)
scene.collection.objects.link(target)

cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 44
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
con = cam.constraints.new("TRACK_TO")
con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Z"

KEYS = 8
for k in range(KEYS + 1):
    f = START + int((END - START) * k / KEYS)
    ang = math.radians(35) + (2 * math.pi * 1.1) * (k / KEYS)
    rad, hgt = 9.6, 6.8
    cam.location = (rad * math.cos(ang), -rad * math.sin(ang), hgt)
    cam.keyframe_insert("location", frame=f)

for name in bpy.data.objects.keys():
    if name.startswith("lbl_"):
        o = bpy.data.objects[name]
        c = o.constraints.new("TRACK_TO")
        c.target = cam
        c.track_axis = "TRACK_Z"
        c.up_axis = "UP_Y"

# ─────────────────────────────────────────────────────────────────────────────
# RENDER SETTINGS
# ─────────────────────────────────────────────────────────────────────────────
scene.frame_start = START
scene.frame_end = END
scene.render.fps = FPS
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100

ver = bpy.app.version
eevee_id = "BLENDER_EEVEE_NEXT" if ver >= (4, 2, 0) else "BLENDER_EEVEE"
try:
    scene.render.engine = eevee_id
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
ee = getattr(scene, "eevee", None)
if ee is not None:
    if hasattr(ee, "taa_render_samples"):
        ee.taa_render_samples = 64
    if hasattr(ee, "use_gtao"):
        ee.use_gtao = True
        ee.gtao_distance = 0.35
        ee.gtao_factor = 0.7
