"""
CMOS FABRICATION — cinematic 3D animation (Blender)
===================================================
Builds a full CMOS process on a silicon wafer and animates all 25 steps:
mirror wafer -> thermal oxide -> resist spin-coat -> soft bake -> UV litho ->
develop -> oxide etch -> resist strip -> ion implant -> anneal -> STI -> wells ->
gate oxide -> poly -> gate pattern -> spacers -> S/D -> silicide -> ILD ->
contact etch -> tungsten -> Metal-1 -> vias -> upper metals -> passivation.

Doping regions (epi / wells / S-D) are drawn as a coloured cross-section on the
FRONT face; physical films (oxide, nitride, poly, silicide, tungsten, metal,
dielectric, passivation) are full 3D — a cut-away that reads as a real device.
Each layer grows in as its step runs; UV beams, plasma glow, ion beams and an
anneal heat aura play on the relevant steps; the camera orbits cinematically.

HOW TO RENDER
-------------
GUI:   Blender > Scripting tab > Open this file > Run Script.
       Then: Render menu > Render Animation  (Ctrl+F12).
CLI:   blender --background --python blender/cmos_fabrication.py -- --render
       (add nothing to just build; the trailing --render makes it render now)

Output: an MP4 lands next to your home Desktop as  cmos_fabrication_*.mp4
        (change OUT_DIR below). Default: 1920x1080, 30 fps, ~2.5 min (25 x 6 s).

Tested against Blender 3.6 – 4.2. Uses Eevee for practical render times; switch
scene.render.engine to 'CYCLES' for maximum quality (much slower).
"""

import bpy
import os
import sys
import math
from mathutils import Matrix, Vector

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
FPS = 30
STEP_SECONDS = 6.0                     # time per step  → 25 * 6 = 150 s (2.5 min)
GROW = 14                              # frames a layer takes to "grow in"
RES_X, RES_Y = 1920, 1080
OUT_DIR = os.path.join(os.path.expanduser("~"), "Desktop")
OUT_NAME = "cmos_fabrication_"
STEP_LEN = int(STEP_SECONDS * FPS)
START = 1

# ─────────────────────────────────────────────────────────────────────────────
# STEP LIST (matches the 25-step brief)
# ─────────────────────────────────────────────────────────────────────────────
STEPS = [
    ("Silicon Wafer", "Mirror-polished 200 mm Si"),
    ("Thermal Oxidation", "SiO2 grown in furnace"),
    ("Photoresist Spin-Coat", "Resist spun onto the wafer"),
    ("Soft Bake", "Hot-plate cure"),
    ("UV Photolithography", "Photomask + UV exposure"),
    ("Develop Resist", "Exposed resist dissolves"),
    ("Oxide Etch", "Plasma dry-etch of SiO2"),
    ("Strip Photoresist", "Patterned oxide remains"),
    ("Ion Implantation", "B / P ion beams"),
    ("Anneal", "RTA repairs the lattice"),
    ("Shallow Trench Isolation", "Trench + oxide fill"),
    ("Well Formation", "N-well & P-well"),
    ("Gate Oxide", "Thin gate dielectric"),
    ("Polysilicon Deposition", "LPCVD blanket poly"),
    ("Gate Patterning", "DUV + plasma etch"),
    ("Sidewall Spacers", "CVD + anisotropic etch"),
    ("Source / Drain", "n+ / p+ implant"),
    ("Silicide (CoSi2)", "Self-aligned silicide"),
    ("Interlayer Dielectric", "ILD / BPSG deposited"),
    ("Contact Etch", "Contact holes opened"),
    ("Tungsten Contacts", "W plug fill + CMP"),
    ("Metal-1", "Al-Cu deposit + pattern"),
    ("Via Formation", "Tungsten vias"),
    ("Upper Metals (M2-M3)", "Stacked interconnect"),
    ("Passivation & Pads", "Seal + bond-pad open"),
]
N = len(STEPS)
END = START + N * STEP_LEN


def sframe(i):
    return START + i * STEP_LEN


# ─────────────────────────────────────────────────────────────────────────────
# GEOMETRY COORDS  (X = width, Y = depth, Z = up)
# ─────────────────────────────────────────────────────────────────────────────
HD = 4.5
FRONT = HD + 0.04
XL, XR = -9.0, 9.0
GH = 1.3
XP, XN = -3.0, 3.0                     # PMOS (n-well, left), NMOS (p-well, right)
gP0, gP1, gN0, gN1 = XP - GH, XP + GH, XN - GH, XN + GH
nwL, nwR = -5.4, -0.6
pwL, pwR = 0.6, 5.4
STI = [(-6.6, -5.4), (-0.6, 0.6), (5.4, 6.6)]
SDP = [(nwL, gP0), (gP1, nwR)]
SDN = [(pwL, gN0), (gN1, pwR)]
PLUGX = [(nwL + gP0) / 2, (gP1 + nwR) / 2, (pwL + gN0) / 2, (gN1 + pwR) / 2]

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
        try:
            m.shadow_method = "NONE"
        except Exception:
            pass
    return m


MAT = {
    "substrate": mat("substrate", "#6e6678", 0.08, 0.72),
    "epi": mat("epi", "#8a8296", 0.05, 0.7),
    "pwell": mat("pwell", "#b08a50", 0.05, 0.7),
    "nwell": mat("nwell", "#6c8cb0", 0.05, 0.7),
    "oxide": mat("oxide", "#e0a43a", 0.12, 0.5),
    "nitride": mat("nitride", "#6fa96b", 0.05, 0.6),
    "poly": mat("poly", "#e6853c", 0.05, 0.55),
    "silicide": mat("silicide", "#53a6a0", 0.55, 0.3),
    "tungsten": mat("tungsten", "#8a929e", 0.85, 0.3),
    "metal": mat("metal", "#c3d0e0", 0.92, 0.2),
    "diel": mat("diel", "#e7dcc0", 0.0, 0.35, alpha=0.32),
    "pass": mat("pass", "#9abfad", 0.0, 0.35, alpha=0.5),
    "sdn": mat("sdn", "#86add0", 0.05, 0.66),
    "sdp": mat("sdp", "#ce9c82", 0.05, 0.66),
    "resist": mat("resist", "#ef3d86", 0.0, 0.5, alpha=0.75),
    "uv": mat("uv", "#a488ff", 0.0, 0.4, alpha=0.28, emis="#7a4dff", emis_str=6.0),
    "mask": mat("mask", "#161d28", 0.6, 0.4),
    "plasma": mat("plasma", "#b06bff", 0.0, 0.4, alpha=0.18, emis="#9a4dff", emis_str=5.0),
    "ion": mat("ion", "#46cfe0", 0.3, 0.3, emis="#2aa6b8", emis_str=7.0),
    "heat": mat("heat", "#ff6a1a", 0.0, 0.5, alpha=0.12, emis="#ff5510", emis_str=4.0),
    "hud": mat("hud", "#ffffff", 0.0, 0.5, emis="#ffffff", emis_str=1.6),
    "hudacc": mat("hudacc", "#e0913c", 0.0, 0.5, emis="#e0913c", emis_str=2.0),
}

# ─────────────────────────────────────────────────────────────────────────────
# SCENE RESET
# ─────────────────────────────────────────────────────────────────────────────
scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

# ─────────────────────────────────────────────────────────────────────────────
# BOX / PLATE / CYLINDER builders with grow-in + visibility keyframes
# ─────────────────────────────────────────────────────────────────────────────
def _key_hide(o, frame, hidden):
    o.hide_viewport = hidden
    o.hide_render = hidden
    o.keyframe_insert("hide_viewport", frame=frame)
    o.keyframe_insert("hide_render", frame=frame)


def _grow(o, appear, remove, grow=GROW):
    h = o.scale.z
    fa = sframe(appear)
    if appear > 0:
        _key_hide(o, START, True)
        _key_hide(o, fa, False)
    else:
        _key_hide(o, START, False)
    if remove is not None:
        _key_hide(o, sframe(remove), True)
    # grow from base
    o.scale.z = 0.0008
    o.keyframe_insert("scale", index=2, frame=fa)
    o.scale.z = h
    o.keyframe_insert("scale", index=2, frame=fa + grow)


def box(name, x0, x1, y0, y1, z0, z1, m, appear, remove=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.name = name
    o.data.transform(Matrix.Translation((0, 0, 0.5)))          # origin -> bottom
    o.scale = (x1 - x0, y1 - y0, z1 - z0)
    o.location = ((x0 + x1) / 2, (y0 + y1) / 2, z0)
    o.data.materials.append(m)
    _grow(o, appear, remove)
    return o


def plate(name, x0, x1, z0, z1, m, appear, remove=None, yoff=0.0):
    return box(name, x0, x1, FRONT + yoff, FRONT + yoff + 0.06, z0, z1, m, appear, remove)


def cyl(name, x, y, z0, z1, r, m, appear, remove=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=1, vertices=24)
    o = bpy.context.active_object
    o.name = name
    o.data.transform(Matrix.Translation((0, 0, 0.5)))
    o.scale = (1, 1, z1 - z0)
    o.location = (x, y, z0)
    o.data.materials.append(m)
    _grow(o, appear, remove)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# BUILD THE DEVICE  (appear step index, remove step index)
# ─────────────────────────────────────────────────────────────────────────────
# silicon body + epi cross-section
box("substrate", XL, XR, -HD, HD, -5, 0, MAT["substrate"], 0)
plate("epi", XL, XR, -0.4, 0, MAT["epi"], 0, remove=11, yoff=0.0)

# demo oxide / resist patterning cycle (steps 1-8)
box("oxide_blanket", XL, XR, -HD, HD, 0, 0.16, MAT["oxide"], 1, remove=10)
box("resist_blanket", XL, XR, -HD, HD, 0.16, 0.55, MAT["resist"], 2, remove=5)
# developed (patterned) resist, then etched oxide gaps, then stripped
for i, (a, b) in enumerate([(XL, -1), (1, XR)]):
    box("resist_dev_%d" % i, a, b, -HD, HD, 0.16, 0.55, MAT["resist"], 5, remove=7)

# STI trenches + oxide (cross-section)
for i, (a, b) in enumerate(STI):
    plate("trench_%d" % i, a, b, -2.8, 0, MAT["substrate"], 10, remove=11, yoff=0.06)
    plate("sti_%d" % i, a, b, -2.8, 0, MAT["oxide"], 11, yoff=0.06)

# wells
plate("nwell", nwL, nwR, -3, 0, MAT["nwell"], 11, yoff=0.12)
plate("pwell", pwL, pwR, -3, 0, MAT["pwell"], 11, yoff=0.12)

# gate oxide + poly
box("gateox", nwL, pwR, -HD, HD, 0, 0.12, MAT["oxide"], 12, remove=18)
box("poly_blanket", -6.6, 6.6, -HD, HD, 0.12, 1.4, MAT["poly"], 13, remove=14)
box("gateP", gP0, gP1, -HD, HD, 0.12, 1.4, MAT["poly"], 14)
box("gateN", gN0, gN1, -HD, HD, 0.12, 1.4, MAT["poly"], 14)

# S/D extensions -> deep S/D (cross-section)
for i, (a, b) in enumerate(SDP):
    plate("sdp_ext_%d" % i, a, b, -0.5, 0, MAT["sdp"], 8, yoff=0.18)
    plate("sdp_deep_%d" % i, a + 0.02, b - 0.02, -1.15, 0, MAT["sdp"], 16, yoff=0.24)
for i, (a, b) in enumerate(SDN):
    plate("sdn_ext_%d" % i, a, b, -0.5, 0, MAT["sdn"], 8, yoff=0.18)
    plate("sdn_deep_%d" % i, a + 0.02, b - 0.02, -1.15, 0, MAT["sdn"], 16, yoff=0.24)

# spacers
for i, (a, b) in enumerate([(gP0 - 0.42, gP0), (gP1, gP1 + 0.42), (gN0 - 0.42, gN0), (gN1, gN1 + 0.42)]):
    box("spacer_%d" % i, a, b, -HD, HD, 0.12, 1.0, MAT["nitride"], 15)

# silicide caps
box("sil_gP", gP0, gP1, -HD, HD, 1.4, 1.56, MAT["silicide"], 17)
box("sil_gN", gN0, gN1, -HD, HD, 1.4, 1.56, MAT["silicide"], 17)
for i, (a, b) in enumerate([(nwL, gP0 - 0.42), (gP1 + 0.42, nwR), (pwL, gN0 - 0.42), (gN1 + 0.42, pwR)]):
    box("sil_sd_%d" % i, a, b, -HD, HD, 0.12, 0.26, MAT["silicide"], 17)

# ILD + tungsten contacts + Metal-1
box("ild", XL, XR, -HD, HD, 0, 3.0, MAT["diel"], 18)
for zi, y in enumerate([-2.6, 0, 2.6]):
    for xi, x in enumerate(PLUGX):
        cyl("wplug_%d_%d" % (zi, xi), x, y, -0.2, 3.0, 0.33, MAT["tungsten"], 20)
for xi, x in enumerate(PLUGX):
    box("m1_%d" % xi, x - 0.55, x + 0.55, -HD, HD, 3.0, 3.62, MAT["metal"], 21)

# upper interconnect: IMD + vias + M2 (perp) + IMD + vias + M3
box("imd2", XL, XR, -HD, HD, 3.62, 4.95, MAT["diel"], 22)
for i, (x, y) in enumerate([(-4.85, -2.4), (-4.85, 2.4), (4.85, -2.4), (4.85, 2.4)]):
    cyl("via1_%d" % i, x, y, 3.62, 4.95, 0.3, MAT["tungsten"], 22)
for i, y in enumerate([-2.4, 2.4]):
    box("m2_%d" % i, -6, 6, y - 0.55, y + 0.55, 4.95, 5.6, MAT["metal"], 23)
box("imd3", XL, XR, -HD, HD, 5.6, 6.7, MAT["diel"], 23)
for i, (x, y) in enumerate([(-3, -2.4), (-3, 2.4), (3, -2.4), (3, 2.4)]):
    cyl("via2_%d" % i, x, y, 5.6, 6.7, 0.3, MAT["tungsten"], 23)
for i, x in enumerate([-3, 3]):
    box("m3_%d" % i, x - 0.55, x + 0.55, -HD, HD, 6.7, 7.3, MAT["metal"], 23)

# passivation + bond pad
box("pass_L", XL, 1.4, -HD, HD, 7.3, 7.95, MAT["pass"], 24)
box("pass_R", 3.6, XR, -HD, HD, 7.3, 7.95, MAT["pass"], 24)
box("bondpad", 1.4, 3.6, -HD, HD, 7.3, 7.42, MAT["metal"], 24)

# ─────────────────────────────────────────────────────────────────────────────
# PROCESS EFFECTS  (visible only during their step windows)
# ─────────────────────────────────────────────────────────────────────────────
def show_windows(o, steps):
    """Hide always except during the given step indices."""
    o.hide_viewport = True
    o.hide_render = True
    o.keyframe_insert("hide_viewport", frame=START)
    o.keyframe_insert("hide_render", frame=START)
    for s in steps:
        _key_hide(o, sframe(s), False)
        _key_hide(o, sframe(s) + STEP_LEN - 2, True)


UV_STEPS = [4, 14, 21, 22]
PLASMA_STEPS = [6, 14, 19, 21, 22]
ION_STEPS = [8, 16]
HEAT_STEPS = [3, 9, 17]

# UV photomask + beams
maskobj = box("photomask", XL, XR, -HD - 0.5, HD + 0.5, 9.3, 9.7, MAT["mask"], 0)
maskobj.animation_data_clear()
show_windows(maskobj, UV_STEPS)
for i, x in enumerate([-6.6, -5.4, -0.6, 0.6, 5.4, 6.6, -4.3, -1.7, 1.7, 4.3]):
    b = box("uvbeam_%d" % i, x - 0.28, x + 0.28, -HD, HD, 0.6, 9.2, MAT["uv"], 0)
    b.animation_data_clear()
    show_windows(b, UV_STEPS)

# plasma etch glow
plasma_glow = box("plasma_glow", XL, XR, -HD, HD, 0.5, 3.0, MAT["plasma"], 0)
plasma_glow.animation_data_clear()
show_windows(plasma_glow, PLASMA_STEPS)

# ion beams (descend continuously via a driver on Z)
def add_ion(name, x, y, phase):
    bpy.ops.mesh.primitive_cone_add(radius1=0.28, depth=0.85, vertices=16)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler[0] = math.pi
    o.location = (x, y, 6)
    o.data.materials.append(MAT["ion"])
    fcu = o.driver_add("location", 2)
    drv = fcu.driver
    drv.type = "SCRIPTED"
    drv.expression = "1.0 + (6.0 - ((frame*0.28 + %.2f) %% 6.0))" % phase
    return o

ion_group = []
for xi, x in enumerate([-6.5, -5, -3.5, -2, -0.5, 1, 2.5, 4, 5.5]):
    for yi, y in enumerate([-2.6, 0, 2.6]):
        o = add_ion("ion_%d_%d" % (xi, yi), x, y, xi * 0.7 + yi * 1.6)
        show_windows(o, ION_STEPS)
        ion_group.append(o)

# anneal heat aura
heat = box("heat_glow", XL - 0.7, XR + 0.7, -HD - 0.7, HD + 0.7, -0.5, 8.5, MAT["heat"], 0)
heat.animation_data_clear()
show_windows(heat, HEAT_STEPS)

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

key = add_light("Key", "AREA", (16, -20, 26), 4000, (1.0, 0.98, 0.95))
key.rotation_euler = (math.radians(52), 0, math.radians(35))
fill = add_light("Fill", "AREA", (-22, -10, 14), 1500, (0.75, 0.82, 1.0))
rim = add_light("Rim", "AREA", (0, 24, 12), 1800, (1.0, 0.9, 0.75))

# ground grid plane
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 0, -5.06))
ground = bpy.context.active_object
ground.name = "ground"
gmat = mat("ground", "#0c1524", 0.0, 0.9)
ground.data.materials.append(gmat)

# ─────────────────────────────────────────────────────────────────────────────
# CAMERA  (orbit + gentle dolly, aiming at the wafer)
# ─────────────────────────────────────────────────────────────────────────────
target = bpy.data.objects.new("CamTarget", None)
target.location = (0, 0, 2.2)
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

# keyframe a slow ~1.15-turn orbit with breathing radius/height
KEYS = 10
for k in range(KEYS + 1):
    f = START + int((END - START) * k / KEYS)
    ang = math.radians(35) + (2 * math.pi * 1.15) * (k / KEYS)
    rad = 34 + 5 * math.sin(k / KEYS * math.pi * 2)
    hgt = 15 + 6 * math.sin(k / KEYS * math.pi)
    cam.location = (rad * math.cos(ang), -rad * math.sin(ang), hgt)
    cam.keyframe_insert("location", frame=f)

# ─────────────────────────────────────────────────────────────────────────────
# HUD TEXT  (step number / title / method — updated each frame via handler)
# ─────────────────────────────────────────────────────────────────────────────
def add_text(name, size, m, offset):
    t = bpy.data.curves.new(name, "FONT")
    t.size = size
    o = bpy.data.objects.new(name, t)
    o.data.body = ""
    o.data.materials.append(m)
    o.parent = cam
    o.location = offset            # in camera local space
    scene.collection.objects.link(o)
    return o

# placed in the camera's lower-left; tweak offsets if clipped
txt_no = add_text("hud_no", 0.055, MAT["hudacc"], (-0.62, -0.30, -1.5))
txt_title = add_text("hud_title", 0.11, MAT["hud"], (-0.62, -0.37, -1.5))
txt_method = add_text("hud_method", 0.05, MAT["hud"], (-0.62, -0.47, -1.5))


def _hud_update(scn):
    f = scn.frame_current
    idx = max(0, min(N - 1, (f - START) // STEP_LEN))
    txt_no.data.body = "STEP %d / %d" % (idx + 1, N)
    txt_title.data.body = STEPS[idx][0]
    txt_method.data.body = STEPS[idx][1]


# register (avoid duplicate handlers on re-run)
bpy.app.handlers.frame_change_pre.clear()
bpy.app.handlers.frame_change_pre.append(_hud_update)
_hud_update(scene)

# ─────────────────────────────────────────────────────────────────────────────
# RENDER SETTINGS
# ─────────────────────────────────────────────────────────────────────────────
scene.frame_start = START
scene.frame_end = END
scene.render.fps = FPS
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100

# Eevee (fast). Handle version differences in the engine id + bloom.
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
        ee.bloom_intensity = 0.05
    if hasattr(ee, "use_ssr"):
        ee.use_ssr = True
        ee.use_ssr_refraction = True
    if hasattr(ee, "taa_render_samples"):
        ee.taa_render_samples = 64
try:
    scene.render.use_motion_blur = True
except Exception:
    pass

# output as a single MP4 (H.264)
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
print("CMOS fabrication scene built: %d steps, frames %d-%d (%.1f s at %d fps)."
      % (N, START, END, (END - START) / FPS, FPS))
print("Output ->", scene.render.filepath + "%04d-%04d.mp4" % (START, END))

# Auto-render if launched with a trailing "--render" argument.
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--render" in argv:
    print("Rendering animation ...")
    bpy.ops.render.render(animation=True)
