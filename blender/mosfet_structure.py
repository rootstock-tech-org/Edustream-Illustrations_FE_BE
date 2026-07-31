"""
MOSFET STRUCTURE — a fabrication-accurate, fully labeled 3D cross-section (Blender)
====================================================================================
A single n-channel MOSFET built and labeled like a real fab cross-section (the
self-aligned LDD poly-gate architecture from Sedra/Smith, Streetman and every
real sub-micron process flow), not a simplified cartoon:

  P-substrate -> deep n+ source/drain -> shallow n- LDD extensions (self-aligned
  to the gate, tucked *under* the sidewall spacers) -> thin gate oxide -> poly
  gate (defines the channel length) -> nitride sidewall spacers -> self-aligned
  silicide caps (blocked over the spacers, exactly like real salicide) ->
  tungsten contacts -> a separate p+ body/bulk tap for the 4th terminal.

Every part gets a camera-facing text label + leader line, named exactly like a
textbook diagram: Gate, Source, Drain, Gate Oxide, n+ Source/Drain, LDD (n-)
Extension, Channel (Inversion Layer), Sidewall Spacer, Silicide, Tungsten
Contact, Body / Bulk (p+), P-Substrate.

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

HD = 1.9                               # half-depth (Y) of the device body

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
    "substrate": mat("substrate", "#c9c2ad", 0.05, 0.8),          # p-substrate — bulk Si
    "nplus": mat("nplus", "#e6963c", 0.05, 0.6),                  # n+ deep source/drain
    "ldd": mat("ldd", "#f0c48a", 0.05, 0.65),                     # n- LDD extension (lighter = lighter doping)
    "pplus": mat("pplus", "#5ea95b", 0.05, 0.6),                  # p+ body/bulk tap
    "channel": mat("channel", "#5fd8ff", 0.1, 0.35, emis="#3fc0ff", emis_str=1.6),  # inversion layer
    "oxide": mat("oxide", "#a9cfe0", 0.1, 0.3, alpha=0.92),       # gate oxide (SiO2)
    "gate": mat("gate", "#c9532e", 0.15, 0.45),                   # polysilicon gate
    "spacer": mat("spacer", "#6fa96b", 0.05, 0.6),                # nitride sidewall spacer
    "silicide": mat("silicide", "#53a6a0", 0.55, 0.3),            # self-aligned silicide (CoSi2/NiSi)
    "tungsten": mat("tungsten", "#8a929e", 0.85, 0.3),            # W contact plug
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
# BUILD THE DEVICE  (X = width, Y = depth, Z = up)  — self-aligned LDD MOSFET
# ─────────────────────────────────────────────────────────────────────────────
GH = 0.95                              # gate/channel half-length -> defines L
LDD_W = 0.34                           # LDD extension width (under the spacer)
SPACER_W = LDD_W                       # spacer footprint == LDD footprint (self-aligned)
NP_OUT = 2.55                          # outer edge of the deep n+ source/drain
GATE_H = 0.58                          # poly gate height
SPACER_H = 0.4                         # spacer height (shorter than the gate)
OX_H = 0.055                           # gate oxide thickness (exaggerated for legibility)
OX_OVERHANG = 0.18                     # SiO2 peeks out past the gate edge on both sides
SUB_TOP = 0.0                          # silicon surface
SUB_BOT = -1.05                        # a snug base slab, not a huge block

OX_HALF = GH + OX_OVERHANG             # half-width of the visible oxide strip
sp0, sp1 = OX_HALF, OX_HALF + SPACER_W  # right-side spacer span (starts past the oxide)
np0, np1 = sp1, NP_OUT                 # right-side deep n+ span

# separate p+ BODY / BULK tap — the 4th terminal, sits just past the drain-mirror
BODY_X0, BODY_X1 = -(NP_OUT + 1.2), -(NP_OUT + 0.4)
SUB_X0, SUB_X1 = BODY_X0 - 0.45, NP_OUT + 0.45

box("substrate", SUB_X0, SUB_X1, -HD, HD, SUB_BOT, SUB_TOP, MAT["substrate"], bevel=0.03)

# LDD (n-) extensions — self-aligned to the GATE edge, shallow, sit *under* the spacer
box("ldd_R", GH, sp1, -HD, HD, -0.22, SUB_TOP, MAT["ldd"], bevel=0.012)
box("ldd_L", -sp1, -GH, -HD, HD, -0.22, SUB_TOP, MAT["ldd"], bevel=0.012)

# deep n+ source / drain — self-aligned to the SPACER outer edge, deeper
box("nplus_drain", np0, np1, -HD, HD, -0.7, SUB_TOP, MAT["nplus"], bevel=0.018)
box("nplus_source", -np1, -np0, -HD, HD, -0.7, SUB_TOP, MAT["nplus"], bevel=0.018)

# inversion channel — thin conducting sliver between the two LDD regions,
# directly under the gate oxide (this is what the gate voltage switches on)
box("channel", -GH, GH, -HD, HD, -0.03, SUB_TOP, MAT["channel"], bevel=0)

# gate oxide — wider than the gate/channel, overhanging both edges (matches the
# classic cross-section where the SiO2 strip peeks out past the metal electrode)
box("gate_oxide", -OX_HALF, OX_HALF, -HD, HD, SUB_TOP, OX_H, MAT["oxide"], bevel=0)

# polysilicon gate
box("gate", -GH, GH, -HD, HD, OX_H, OX_H + GATE_H, MAT["gate"], bevel=0.02)

# nitride sidewall spacers — flank the gate, taper suggested via two stacked boxes
box("spacer_R_lo", sp0, sp1, -HD, HD, SUB_TOP, SPACER_H, MAT["spacer"], bevel=0.012)
box("spacer_R_hi", sp0, sp0 + SPACER_W * 0.45, -HD, HD, SPACER_H, SPACER_H + 0.16, MAT["spacer"], bevel=0.012)
box("spacer_L_lo", -sp1, -sp0, -HD, HD, SUB_TOP, SPACER_H, MAT["spacer"], bevel=0.012)
box("spacer_L_hi", -(sp0 + SPACER_W * 0.45), -sp0, -HD, HD, SPACER_H, SPACER_H + 0.16, MAT["spacer"], bevel=0.012)

# self-aligned silicide — forms on exposed silicon/poly, BLOCKED over the
# spacers (real salicide process), so it caps the gate top and the outer n+ only
box("silicide_gate", -GH, GH, -HD, HD, OX_H + GATE_H, OX_H + GATE_H + 0.1, MAT["silicide"], bevel=0.01)
box("silicide_drain", np0, np1, -HD, HD, SUB_TOP, 0.09, MAT["silicide"], bevel=0)
box("silicide_source", -np1, -np0, -HD, HD, SUB_TOP, 0.09, MAT["silicide"], bevel=0)

# tungsten contacts landing on the silicide (Gate / Source / Drain)
cyl("contact_gate", 0, 0, OX_H + GATE_H + 0.1, OX_H + GATE_H + 0.85, 0.24, MAT["tungsten"])
cyl("contact_drain", (np0 + np1) / 2, 0, 0.09, 0.8, 0.28, MAT["tungsten"])
cyl("contact_source", -(np0 + np1) / 2, 0, 0.09, 0.8, 0.28, MAT["tungsten"])

box("pplus_body", BODY_X0, BODY_X1, -HD, HD, -0.4, SUB_TOP, MAT["pplus"], bevel=0.015)
box("silicide_body", BODY_X0, BODY_X1, -HD, HD, SUB_TOP, 0.09, MAT["silicide"], bevel=0)
cyl("contact_body", (BODY_X0 + BODY_X1) / 2, 0, 0.09, 0.8, 0.26, MAT["tungsten"])

# ─────────────────────────────────────────────────────────────────────────────
# LABELS + LEADER LINES
# ─────────────────────────────────────────────────────────────────────────────
GATE_TOP = Vector((0, -HD * 0.3, OX_H + GATE_H + 0.85))
DRN_TOP = Vector(((np0 + np1) / 2, -HD * 0.3, 0.8))
SRC_TOP = Vector((-(np0 + np1) / 2, -HD * 0.3, 0.8))
BODY_TOP = Vector(((BODY_X0 + BODY_X1) / 2, -HD * 0.3, 0.8))

GATE_LABEL = Vector((0, -HD - 1.0, 1.85))
DRN_LABEL = Vector(((np0 + np1) / 2, -HD - 1.0, 1.55))
SRC_LABEL = Vector((-(np0 + np1) / 2, -HD - 1.0, 1.55))
BODY_LABEL = Vector(((BODY_X0 + BODY_X1) / 2, -HD - 1.0, 1.55))

leader("leader_gate", GATE_LABEL + Vector((0, 0, -0.2)), GATE_TOP, MAT["leader"])
leader("leader_drain", DRN_LABEL + Vector((0, 0, -0.2)), DRN_TOP, MAT["leader"])
leader("leader_source", SRC_LABEL + Vector((0, 0, -0.2)), SRC_TOP, MAT["leader"])
leader("leader_body", BODY_LABEL + Vector((0, 0, -0.2)), BODY_TOP, MAT["leader"])

label("lbl_gate", "Gate (G)", GATE_LABEL, 0.28)
label("lbl_drain", "Drain (D)", DRN_LABEL, 0.24)
label("lbl_source", "Source (S)", SRC_LABEL, 0.24)
label("lbl_body", "Body / Bulk (B)", BODY_LABEL, 0.22)

# structural / doping labels — smaller tags with short leaders, front-face side
GOX_TARGET = Vector((OX_HALF - 0.02, -HD, OX_H / 2))
GOX_LABEL = Vector((OX_HALF + 1.35, -HD - 1.1, 0.7))
leader("leader_oxide", GOX_LABEL + Vector((-0.3, 0, -0.2)), GOX_TARGET, MAT["leader"])
label("lbl_oxide", "Gate Oxide (SiO2)", GOX_LABEL, 0.19)

CHAN_TARGET = Vector((0, -HD, -0.015))
CHAN_LABEL = Vector((-1.1, -HD - 1.35, -0.95))
leader("leader_channel", CHAN_LABEL + Vector((0.3, 0, 0.3)), CHAN_TARGET, MAT["leader"])
label("lbl_channel", "Channel (Inversion Layer)", CHAN_LABEL, 0.19)

LDD_TARGET = Vector(((sp0 + sp1) / 2, -HD, -0.1))
LDD_LABEL = Vector((sp1 + 1.1, -HD - 1.15, -0.6))
leader("leader_ldd", LDD_LABEL + Vector((-0.3, 0, 0.2)), LDD_TARGET, MAT["leader"])
label("lbl_ldd", "LDD (n-) Extension", LDD_LABEL, 0.19)

SPC_TARGET = Vector((sp0 + SPACER_W * 0.3, -HD, SPACER_H * 0.6))
SPC_LABEL = Vector((sp0 + 1.9, -HD - 0.85, 1.65))
leader("leader_spacer", SPC_LABEL + Vector((-0.3, 0, -0.2)), SPC_TARGET, MAT["leader"])
label("lbl_spacer", "Sidewall Spacer (Si3N4)", SPC_LABEL, 0.19)

SIL_TARGET = Vector(((np0 + np1) / 2, -HD, 0.09))
SIL_LABEL = Vector((np1 + 0.8, -HD - 1.35, 0.45))
leader("leader_silicide", SIL_LABEL + Vector((-0.3, 0, -0.15)), SIL_TARGET, MAT["leader"])
label("lbl_silicide", "Silicide (Self-Aligned)", SIL_LABEL, 0.19)

W_TARGET = Vector(((np0 + np1) / 2, 0, 0.5))
W_LABEL = Vector((np1 + 2.0, HD + 1.0, 1.9))
leader("leader_w", W_LABEL + Vector((-0.3, 0, -0.2)), W_TARGET, MAT["leader"])
label("lbl_w", "Tungsten Contact", W_LABEL, 0.19)

NP_TARGET_R = Vector(((np0 + np1) / 2, HD, -0.35))
NP_LABEL_R = Vector(((np0 + np1) / 2, HD + 1.3, -1.15))
leader("leader_np_r", NP_LABEL_R + Vector((0, 0, 0.3)), NP_TARGET_R, MAT["leader"])
label("lbl_np_r", "n+ Drain (Deep)", NP_LABEL_R, 0.19)

NP_TARGET_L = Vector((-(np0 + np1) / 2, HD, -0.35))
NP_LABEL_L = Vector((-(np0 + np1) / 2, HD + 1.3, -1.15))
leader("leader_np_l", NP_LABEL_L + Vector((0, 0, 0.3)), NP_TARGET_L, MAT["leader"])
label("lbl_np_l", "n+ Source (Deep)", NP_LABEL_L, 0.19)

PB_TARGET = Vector(((BODY_X0 + BODY_X1) / 2, HD, -0.2))
PB_LABEL = Vector(((BODY_X0 + BODY_X1) / 2 - 0.4, HD + 1.3, -1.0))
leader("leader_pb", PB_LABEL + Vector((0.2, 0, 0.2)), PB_TARGET, MAT["leader"])
label("lbl_pb", "p+ Body Tap", PB_LABEL, 0.17)

PTYPE_LABEL = Vector((NP_OUT * 0.7, -HD - 0.05, SUB_BOT * 0.55))
label("lbl_ptype", "P-Substrate", PTYPE_LABEL, 0.24)

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

bpy.ops.mesh.primitive_plane_add(size=90, location=(0, 0, SUB_BOT - 0.06))
ground = bpy.context.active_object
ground.name = "ground"
ground.data.materials.append(mat("ground", "#0c1524", 0.0, 0.9))

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA  (gentle turntable, aiming at the device)
# ─────────────────────────────────────────────────────────────────────────────
target = bpy.data.objects.new("CamTarget", None)
target.location = (-0.3, 0, 0.15)
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
    ang = math.radians(32) + math.radians(60) * (k / KEYS)
    rad, hgt = 10.5, 4.4
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
