# Simulation engine

Pure JavaScript. **Nothing in this folder may import React.**

That constraint is the point. The safety rules a viewer experiments with are
the same kind of thing as the rules in the real product, and they deserve the
same treatment: testable in plain node, with no browser and no model, so a
change to what counts as a violation is measured rather than eyeballed.

| File | Holds |
|---|---|
| `world.js` | Factory state: things, marked areas, the starting scene |
| `thresholds.js` | Every number the system decides by — the real product's, with the reason for each |
| `legibility.js` | Brightness, focus and compression → judgeable, or **cannot check** |
| `detect.js` | Simulated detections and confidence — deterministic, seeded on the frame |
| `rules.js` | PPE, marked-area, door and workstation rules |
| `confirm.js` | The agreeing-sightings window an accusation must clear |
| `pipeline.js` | Runs one frame end to end and records a stage-by-stage trace |
| `events.js` | Turns settled verdicts into open events that escalate and resolve |
| `story.js` | One decision, told as an ordered sequence of stages |
| `explain.js` | Turns a decision into numbered "why" sentences |

**"Why?" is not written prose.** `explain.js` and `story.js` read the trace
`pipeline.js` already produced. They cannot drift from what actually
happened, because they have no other source.
