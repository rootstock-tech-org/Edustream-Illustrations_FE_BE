# Build notes - prompts I used for each module

Kanan asked me to write down the prompts I actually used to build the modules, in
order, with the problems that came up and how I changed the prompt each time. So
this is not one clean prompt per module, it is more like a diary. The prompts here
are the technical version of what I asked for (my actual wording was rougher).

Quick context on the stack: Vite + React, React Three Fiber for the 3D, Tailwind
for the UI. Every module is its own full-screen tool with a top bar to switch
between them.

## How the project started

My first prompt was basically "make an Industry 4.0 / IIoT learning site from the
PRD, 10 modules, each with a hero image, some widgets and a quiz." I built that and
it came out as a long scrolling page full of small SVG widgets.

That was the wrong read. Kanan wanted each module to be a proper full-screen
interactive 3D tool, like the robot-arm demo I had made earlier, not a page of
widgets.

So I changed the prompt to "start a fresh project: 10 standalone full-screen 3D
tools, one per module, pick between them from a top selector, and only reuse the
content (facts, formulas, questions) from the old build." I also fixed the file
layout for every module to be the same: data.js for content and the pure sim,
a Scene file for the R3F rendering, a Widgets file, and a Tool file that wires up
the canvas, the left controls, the right live readings and the quiz.

A few prompts I ended up repeating on almost every module:
- add a dark/light theme (the whole thing was dark-only at first)
- make the side widgets actually do something and affect the 3D, not just sit there
- base every live number on a real formula, nothing made up
- make everything clickable for info, adjustable, and show the change live

## 1. Foundations (the IoT stack)

Asked for a 3D stack of the IoT architecture layers with data flowing up, click a
layer for its detail. First version used a weird 5-layer set, so I changed the
prompt to use the standard 4 layers (Sensing, Network, Data Processing,
Application) and cite where I got them.

Then the flowing data looked like random floating dots, so I re-prompted to make it
one arrow that climbs the stack one gap at a time.

Last thing: the throughput and latency numbers were made up. Fixed that by asking
for a real per-layer latency budget (2 / 22 / 14 / 8 ms) plus a small queuing delay,
and packets-in-flight = the actual number of arrows on screen.

## 2. Sensors

Prompt was a motor-pump with clickable sensors (temp, vibration, flow, current)
reading live off a physics-ish model. The moment I turned shadows on the console
spammed a deprecated-shadow warning every frame, so I changed the canvas shadow
mode to percentage.

The sensors were just dots at first. I re-prompted to make them always-on clickable
labels (like the robot joint labels) that show the live reading, a sparkline and the
real spec, and colour themselves by the ISO 10816 vibration zone. Also had to bump
up the lights in light mode because the machine looked too dark.

## 3. Communication

MQTT network: publishers, a broker, subscribers, packets moving on the links, with
rate / QoS / loss controls. The packets first looked like an undirected particle
stream, so I asked to make them actual arrow darts pointing at the target, dropped
ones turning red and falling.

Bigger issue: the Lost counter stayed 0 even when darts were clearly dropping,
because the numbers were coming from a formula. Re-prompted to make the stats
event-driven, counting the real delivered/lost darts in a 1-second window so the
panel matches what you see.

## 4. Edge AI

Camera to edge to cloud pipeline, pick edge / cloud / hybrid and a model size, show
latency / bandwidth / accuracy / privacy. I asked for the latency to come from a
real cost model (edge sends a 1 KB result, cloud uploads a 300 KB frame plus a round
trip, hybrid sends 24 KB of features, transfer time = bits over bandwidth). Only
real bug here was the violet buttons being unreadable in light mode, fixed with
light-variant classes.

## 5. Digital Twin

A physical machine plus a twin that only updates on each sync, so a low sync rate
makes it lag. First cut had a unitless "speed" and a magic number for the sync
percent. Re-prompted to make it a real motor speed (load = 600-1500 rpm), sync % =
the honest relative error, divergence in rpm, latency = 1000 / sync rate.

The scene was two plain cylinders and looked cheap, so I asked for a redesign: a
solid motor on the left and a glowing holographic wireframe twin on a hex dais with
a scan ring and little data packets.

Then moving the load slider made the twin flash amber for no good reason. Fixed by
giving the motor some inertia so speed ramps instead of jumping, and only turning
the twin amber when the sync drops below 85%.

Later I went back and checked it against references because it felt too simple. The
problem: a one-way live sync is strictly a digital shadow, not a full digital twin (a
real twin is two-way and also simulates ahead to predict). So I prompted: add a Model
vs Twin tab with the three levels (Digital Model = no auto link, Digital Shadow =
one-way live data, Digital Twin = two-way plus simulation, per Kritzinger 2018), and
state plainly that this tool's live sync is the shadow, while a full twin closes the
loop by acting back on the asset. Added a knowledge-check question on the same point.

## 6. PLC and SCADA

Tank with a pump and valve held between setpoints by a seal-in latch, a live ladder
diagram and a SCADA panel, plus the scan cycle. The scan text was flickering a few
times a second, so I re-prompted to run the scan on its own slower interval with a
counter so Read / Execute / Write is actually readable.

Two more: amber text on an amber background was invisible (switched active amber
controls to dark text on solid amber), and the outflow-demand slider did nothing
because inflow always won, so I raised the outflow rate above the inflow.

## 7. Predictive Maintenance

Motor with a bearing that wears out over time: health, Remaining Useful Life,
vibration, temperature, a Replace button to reset, and a P-F curve with a live dot.
Mostly asked to ground it properly (wear grows with load and faults, vibration and
temp climb as health drops, RUL = time to failure at the current wear rate, ISO
10816 for the vibration bands). This one came together without much drama.

## 8. Cybersecurity

Defence-in-depth: an attack crossing the Purdue zones toward the PLC, toggle five
defences, blocked at the first active one strong enough for the attacker. First
build was flat translucent boxes, so I re-prompted for a proper redesign: layered
zones with a floor pad and a glass volume, a real PLC cabinet in the process zone,
shield walls that pulse when on, and a pulsing attacker with a comet-trail dart.

After that only the zones were clickable. I asked to make the shields and the
attacker clickable too so clicking shows the defence or attack info. Ran into a
sneaky bug: the defence named "dmz" had the same id as the zone "dmz", so clicking
the shield showed the zone. Fixed by namespacing the shield ids, and I had to stop
the see-through zone box from stealing the clicks.

## 9. Robotics

6-axis arm on sliders with a pick-and-place demo, reusing my old robot-arm geometry
and forward kinematics, showing the tool X/Y/Z. Early on the button said Home when
it should reset, and there was a floating marker plus messy labels around the pick.
Re-prompted to rename it Reset, run a full pick-and-place from a Pick stand to a
Place stand, and hide the joint labels while the demo runs.

Then the gripper fingers were going into the block, and the block did not line up
when the wrist tilted. Fixed by matching the exact numbers from my original demo
(block 0.4, closed gap 0.26 + 0.12 so the fingers sit just outside the block) and
parenting the carried block to the wrist so it stays gripped at any angle.

Last two small things: the Demo button icon never changed (made it flip Play/Pause
and Demo/Stop) and the motion looked steppy (eased the joints each frame so it runs
smooth).

One accuracy fix later, from a reference recheck. The problem: my list of the six
robot types had "collaborative" as a type, but a cobot is a way of working safely next
to people, not a mechanical shape. So I prompted: fix the six types to the real
structural set (articulated, cartesian, cylindrical, spherical/polar, SCARA, delta) by
swapping collaborative out for spherical/polar (the old Unimate), and keep the cobot
point in the safety section where it belongs.

## 10. Capstone

Factory floor of eight build pads, one per pillar, toggle each to build it, readiness
and maturity update, built pads connect with flowing links. First version was flat
and empty-looking (plain boxes and floating labels), so I re-prompted for a redesign:
always-visible hex pads, a blueprint outline when empty, and a glowing machine with a
spinning ring and a light beam when built, on a raised platform with glowing links.
Build all 8 and it hits the Autonomous level.

## Rules I kept across all of them

Cite the source and base every number on a real model, no em dashes or curly quotes,
dark and light both work, and everything is clickable for info, adjustable, and
updates live.
