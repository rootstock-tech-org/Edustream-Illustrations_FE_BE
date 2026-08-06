"""
MOSFET STRUCTURE — a clean, textbook-style labeled 3D cross-section (Blender)
====================================================================================
Matches the classic n-channel MOSFET cross-section diagram: P-type substrate,
two N-type diffusions (source/drain), a thin N-type channel, a Metal Oxide
Insulator (SiO2) that overhangs the gate on both sides, a Metal Electrode
(gate) on top, flat metal contact pads on source/drain, a depletion-layer
boundary curving into the substrate, and a substrate/body contact underneath.

Every part gets a camera-facing text label + leader line: Source (S),
Gate (G), Drain (D), Oxide (SiO2), Metal, n+ diffusions, Channel region,
p-type substrate (Body), Depletion region, Body contact, and the L
(gate/channel length) dimension.

Companion piece to cmos_fabrication.py (same helper style / material system)
but this one is a single static/turntable labeled device, not a 25-step
process animation.

HOW TO RENDER
-------------
GUI:   Blender > Scripting tab > Open this file > Run Script.
       Then: Render menu > Render Animation  (Ctrl+F12).
CLI:   blender --background --python blender/mosfet_structure.py -- --render

Output: an MP4 lands next to your home Desktop as  mosfet_structure_*.mp4
        (change OUT_DIR below). Default: 1920x1080, 30 fps, 4 s turntable.

Tested against Blender 3.6 – 4.2. Uses Eevee for practical render times.
"""

import bpy
import os
import sys
import math
from mathutils import Vector

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
FPS = 30
DURATION_S = 4.0                       # short turntable
RES_X, RES_Y = 1920, 1080
OUT_DIR = os.path.join(os.path.expanduser("~"), "Desktop")
OUT_NAME = "mosfet_structure_"
START = 1
END = START + int(DURATION_S * FPS)

HD = 1.7                               # half-depth (Y) of the device body

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
    "substrate": mat("substrate", "#e8c977", 0.05, 0.7),          # p-type substrate — warm gold
    "n": mat("n", "#8fc7e8", 0.08, 0.4),                          # N-type source/drain diffusions
    "channel": mat("channel", "#5fd8ff", 0.1, 0.35, emis="#3fc0ff", emis_str=1.6),  # N-type channel
    "oxide": mat("oxide", "#dcecf5", 0.1, 0.25, alpha=0.95),      # Metal Oxide Insulator (SiO2)
    "metal": mat("metal", "#e9edf0", 0.75, 0.3),                  # Metal Electrode + contact pads
    "depletion": mat("depletion", "#bfe4f2", 0.05, 0.45, emis="#bfe4f2", emis_str=0.2),  # depletion region
    "leader": mat("leader", "#333333", 0.0, 0.6, emis="#333333", emis_str=0.5),
    "label": mat("label", "#ffffff", 0.0, 0.5, emis="#ffffff", emis_str=1.2),
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


def box(name, x0, x1, y0, y1, z0, z1, m, bevel=0.022):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    o.data.materials.append(m)
    if bevel > 0:
        _bevel(o, bevel)
    return o


def cyl(name, x, y, z0, z1, r, m, bevel=0.015):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=1, vertices=24)
    o = bpy.context.active_object
    o.name = name
    o.scale = (1, 1, z1 - z0)
    o.location = (x, y, (z0 + z1) / 2)
    o.data.materials.append(m)
    if bevel > 0:
        _bevel(o, bevel)
    return o


def leader(name, p0, p1, m, radius=0.018):
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


def label(name, text, pos, size=0.32):
    """Camera-facing text label (billboards via a Track To constraint added after the camera exists)."""
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
# BUILD THE DEVICE  (X = width, Y = depth, Z = up)  — matches the classic
# textbook cross-section: N regions, overhanging SiO2, flat metal electrodes
# ─────────────────────────────────────────────────────────────────────────────
GH = 1.0                               # half-length of the channel/gate core
OX_OVERHANG = 0.4                      # SiO2 clearly overhangs the gate on both sides
OX_HALF = GH + OX_OVERHANG             # half-width of the oxide bar
OX_H = 0.14                            # oxide bar thickness (a clearly visible flat layer)
GATE_H = 0.34                          # metal electrode height (flat bar, like the diagram)
SUB_TOP = 0.0                          # silicon surface
SUB_BOT = -1.5                         # P-type substrate body

N_GAP = 0.12                           # N regions tuck slightly under the oxide's outer edge
NP_IN = OX_HALF - N_GAP                # inner edge of the N regions
N_WIDTH = 1.4                          # width of each N region
NP_OUT = NP_IN + N_WIDTH               # outer edge of the N regions
N_DEPTH = -0.6                         # how deep the N diffusions go

PAD_W, PAD_H = 0.55, 0.3               # source/drain flat metal contact pads
BODY_PAD_W, BODY_PAD_H = 0.9, 0.18     # substrate/body contact pad, hangs off the bottom

SUB_X0, SUB_X1 = -(NP_OUT + 0.55), NP_OUT + 0.55

substrate_obj = box("substrate", SUB_X0, SUB_X1, -HD, HD, SUB_BOT, SUB_TOP, MAT["substrate"], bevel=0.05)

# N-type source / drain diffusions
box("n_drain", NP_IN, NP_OUT, -HD, HD, N_DEPTH, SUB_TOP, MAT["n"], bevel=0.03)
box("n_source", -NP_OUT, -NP_IN, -HD, HD, N_DEPTH, SUB_TOP, MAT["n"], bevel=0.03)


def carve_groove(obj, cutter):
    """Boolean-cut a void into obj using cutter (cutter stays live but hidden)."""
    mod = obj.modifiers.new("groove_cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    if hasattr(mod, "solver"):
        mod.solver = "EXACT"
    cutter.hide_render = True
    cutter.hide_viewport = True


# depletion layer — a shallow curved groove carved into the substrate's front
# face right below the channel/junctions, matching the classic textbook bowl
DEPL_RX, DEPL_RY, DEPL_RZ = NP_OUT * 0.78, 0.55, 0.42
DEPL_Z = -0.68

bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, -HD, DEPL_Z))
depl_cutter = bpy.context.active_object
depl_cutter.name = "depletion_cutter"
depl_cutter.scale = (DEPL_RX, DEPL_RY, DEPL_RZ)
carve_groove(substrate_obj, depl_cutter)

DEPL_FILL = 0.9
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, -HD + DEPL_RY * (1 - DEPL_FILL), DEPL_Z))
depletion = bpy.context.active_object
depletion.name = "depletion_layer"
depletion.scale = (DEPL_RX * DEPL_FILL, DEPL_RY * DEPL_FILL, DEPL_RZ * DEPL_FILL)
depletion.data.materials.append(MAT["depletion"])
bpy.ops.object.shade_smooth()

# N-type channel — thin conducting sliver right under the oxide
box("channel", -GH, GH, -HD, HD, -0.05, SUB_TOP, MAT["channel"], bevel=0)

# Metal Oxide Insulator (SiO2) — wide bar overhanging both edges
box("oxide", -OX_HALF, OX_HALF, -HD, HD, SUB_TOP, OX_H, MAT["oxide"], bevel=0.015)

# Metal Electrode (Gate) — narrower bar sitting on top of the oxide
box("gate", -GH, GH, -HD, HD, OX_H, OX_H + GATE_H, MAT["metal"], bevel=0.03)

# Source / Drain metal contact pads — flat pads sitting directly on the N regions
DRAIN_CX = (NP_IN + NP_OUT) / 2
SOURCE_CX = -DRAIN_CX
box("contact_drain", DRAIN_CX - PAD_W / 2, DRAIN_CX + PAD_W / 2, -HD, HD, SUB_TOP, PAD_H, MAT["metal"], bevel=0.03)
box("contact_source", SOURCE_CX - PAD_W / 2, SOURCE_CX + PAD_W / 2, -HD, HD, SUB_TOP, PAD_H, MAT["metal"], bevel=0.03)

# Substrate (body) contact — small pad hanging off the bottom, centered
box("contact_body", -BODY_PAD_W / 2, BODY_PAD_W / 2, -HD * 0.5, HD * 0.5,
    SUB_BOT - BODY_PAD_H, SUB_BOT, MAT["metal"], bevel=0.02)

# ─────────────────────────────────────────────────────────────────────────────
# LABELS + LEADER LINES
# ─────────────────────────────────────────────────────────────────────────────
GATE_TOP = Vector((0, -HD * 0.3, OX_H + GATE_H))
DRN_TOP = Vector((DRAIN_CX, -HD * 0.3, PAD_H))
SRC_TOP = Vector((SOURCE_CX, -HD * 0.3, PAD_H))
BODY_BOT = Vector((0, -HD * 0.3, SUB_BOT - BODY_PAD_H))

GATE_LABEL = Vector((0, -HD - 1.0, 1.55))
DRN_LABEL = Vector((DRAIN_CX, -HD - 1.0, 1.25))
SRC_LABEL = Vector((SOURCE_CX, -HD - 1.0, 1.25))

leader("leader_gate", GATE_LABEL + Vector((0, 0, -0.2)), GATE_TOP, MAT["leader"])
leader("leader_drain", DRN_LABEL + Vector((0, 0, -0.2)), DRN_TOP, MAT["leader"])
leader("leader_source", SRC_LABEL + Vector((0, 0, -0.2)), SRC_TOP, MAT["leader"])

label("lbl_gate", "Gate (G)", GATE_LABEL, 0.26)
label("lbl_drain", "Drain (D)", DRN_LABEL, 0.24)
label("lbl_source", "Source (S)", SRC_LABEL, 0.24)

# structural labels — matching the reference diagram's tags
GOX_TARGET = Vector((OX_HALF - 0.02, -HD, OX_H / 2))
GOX_LABEL = Vector((OX_HALF + 1.2, -HD - 1.0, 0.75))
leader("leader_oxide", GOX_LABEL + Vector((-0.3, 0, -0.2)), GOX_TARGET, MAT["leader"])
label("lbl_oxide", "Oxide (SiO2)", GOX_LABEL, 0.22)

ME_TARGET = Vector((0, -HD, OX_H + GATE_H * 0.5))
ME_LABEL = Vector((0, -HD - 1.0, 2.1))
leader("leader_metal_electrode", ME_LABEL + Vector((0, 0, -0.2)), ME_TARGET, MAT["leader"])
label("lbl_metal_electrode", "Metal", ME_LABEL, 0.22)

CHAN_TARGET = Vector((0, -HD, -0.025))
CHAN_LABEL = Vector((-1.3, -HD - 1.3, -0.75))
leader("leader_channel", CHAN_LABEL + Vector((0.3, 0, 0.25)), CHAN_TARGET, MAT["leader"])
label("lbl_channel", "Channel region", CHAN_LABEL, 0.2)

label("lbl_n_r", "n+", Vector((DRAIN_CX, -HD - 0.35, N_DEPTH * 0.5)), 0.24)

N_LABEL_L = Vector((SOURCE_CX, -HD - 0.35, N_DEPTH * 0.5))
label("lbl_n_l", "n+", N_LABEL_L, 0.24)

DEPL_TARGET = Vector((NP_OUT * 0.35, -HD, DEPL_Z))
DEPL_LABEL = Vector((NP_OUT + 1.1, -HD - 1.4, -0.35))
leader("leader_depletion", DEPL_LABEL + Vector((-0.3, 0, 0.2)), DEPL_TARGET, MAT["leader"])
label("lbl_depletion", "Depletion region", DEPL_LABEL, 0.2)

PTYPE_LABEL = Vector((0, -HD - 0.05, SUB_BOT * 0.4))
label("lbl_ptype", "p-type substrate (Body)", PTYPE_LABEL, 0.26)

SUBCON_TARGET = Vector((0, -HD * 0.3, SUB_BOT - BODY_PAD_H))
SUBCON_LABEL = Vector((0, -HD - 1.0, SUB_BOT - 1.1))
leader("leader_subcon", SUBCON_LABEL + Vector((0, 0, 0.25)), SUBCON_TARGET, MAT["leader"])
label("lbl_subcon", "Body", SUBCON_LABEL, 0.22)

# L — the gate/channel LENGTH dimension, called out with two tick leaders and
# an "L" label centered above the gate, exactly like the reference cross-section.
L_Z = OX_H + GATE_H + 0.28
leader("leader_L_left", Vector((-GH, -HD, OX_H + GATE_H)), Vector((-GH, -HD, L_Z)), MAT["leader"], radius=0.012)
leader("leader_L_right", Vector((GH, -HD, OX_H + GATE_H)), Vector((GH, -HD, L_Z)), MAT["leader"], radius=0.012)
leader("leader_L_span", Vector((-GH, -HD, L_Z)), Vector((GH, -HD, L_Z)), MAT["leader"], radius=0.012)
label("lbl_L", "L", Vector((0, -HD - 0.4, L_Z + 0.28)), 0.24)

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
fill = add_light("Fill", "AREA", (-18, -8, 12), 1200, (0.75, 0.82, 1.0))
rim = add_light("Rim", "AREA", (0, 20, 10), 1500, (1.0, 0.9, 0.75))

bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, SUB_BOT - BODY_PAD_H - 0.08))
ground = bpy.context.active_object
ground.name = "ground"
ground.data.materials.append(mat("ground", "#0c1524", 0.0, 0.9))

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA  (gentle turntable, aiming at the device)
# ─────────────────────────────────────────────────────────────────────────────
target = bpy.data.objects.new("CamTarget", None)
target.location = (0, 0, -0.25)
scene.collection.objects.link(target)

cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 42
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
    rad, hgt = 8.6, 6.2
    cam.location = (rad * math.cos(ang), -rad * math.sin(ang), hgt)
    cam.keyframe_insert("location", frame=f)

# make every label always face the (now-existing) camera
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
    if hasattr(ee, "use_bloom"):
        ee.use_bloom = True
        ee.bloom_intensity = 0.03
    if hasattr(ee, "taa_render_samples"):
        ee.taa_render_samples = 64
    if hasattr(ee, "use_gtao"):
        ee.use_gtao = True
        ee.gtao_distance = 0.35
        ee.gtao_factor = 0.7
    if hasattr(ee, "use_soft_shadows"):
        ee.use_soft_shadows = True

scene.render.image_settings.file_format = "FFMPEG"
scene.render.ffmpeg.format = "MPEG4"
scene.render.ffmpeg.codec = "H264"
scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
scene.render.ffmpeg.ffmpeg_preset = "GOOD"
scene.render.ffmpeg.audio_codec = "NONE"
if not os.path.isdir(OUT_DIR):
    OUT_DIR = os.path.expanduser("~")
scene.render.filepath = os.path.join(OUT_DIR, OUT_NAME)

scene.frame_set(START)
print("MOSFET structure scene built: frames %d-%d (%.1f s at %d fps)."
      % (START, END, (END - START) / FPS, FPS))
print("Output ->", scene.render.filepath + "%04d-%04d.mp4" % (START, END))

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--render" in argv:
    print("Rendering animation ...")
    bpy.ops.render.render(animation=True)
