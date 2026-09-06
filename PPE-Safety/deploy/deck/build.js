const path = require("path");
const pptxgen = require("pptxgenjs");

const S = path.join(__dirname, "shots");
const OUT = path.join(__dirname, "Visual-Analysis-Dashboard.pptx");

/* Palette: the plant, not the boardroom. Deep navy carries the weight,
   hi-vis amber is the one sharp accent — the colour the subject of every
   screenshot is wearing — and red appears only where the product itself
   raises an alarm. */
const NAVY = "0F1D33";
const AMBER = "F2A413";
const RED = "C8433F";
const PAPER = "F5F7FA";
const INK = "14243D";
const MUTED = "5C6E88";
const WHITE = "FFFFFF";

const HEAD = "Cambria";
const BODY = "Calibri";

/* Every screenshot's true aspect, so no box ever squashes one. */
const APP = 1500 / 950;
const RATIO = {
  "dashboard.png": APP,
  "restricted-zone.png": APP,
  "walkways.png": APP,
  "door.png": APP,
  "ppe.png": APP,
  "workstation-graph.png": APP,
  "camera-register.png": APP,
  "cameras.png": APP,
  "events.png": APP,
  "reports.png": APP,
  "zone-occupancy-trim.png": 409 / 129,
  "event-detail-trim.png": 417 / 506,
  "clock-warning-trim.png": 394 / 418,
  "clock-valid-trim.png": 409 / 275,
};
const high = (file, w) => w / RATIO[file];

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
pres.author = "Rootstock Technology";
pres.title = "Visual Analysis Dashboard";

const shadow = () => ({ type: "outer", blur: 14, offset: 3, angle: 90, color: "0A1626", opacity: 0.22 });

/** A dark slide: title decks and closers. */
function dark(slide) {
  slide.background = { color: NAVY };
}

/** Small amber disc + label — the repeated motif, used instead of rules. */
function eyebrow(slide, text, x, y, tone = AMBER, w = 6.5) {
  slide.addShape(pres.ShapeType.ellipse, {
    x, y: y + 0.02, w: 0.16, h: 0.16, fill: { color: tone }, line: { color: tone },
  });
  slide.addText(text.toUpperCase(), {
    x: x + 0.28, y, w, h: 0.24, fontFace: BODY, fontSize: 11, bold: true,
    color: tone, charSpacing: 1.6, margin: 0, valign: "middle",
  });
}

/* Every title is kept to one line at 34pt in an 11.6" box (~40 characters).
   A wrapped title grows out of its box and lands on the content below it. */
function slideTitle(slide, text, opts = {}) {
  slide.addText(text, {
    x: opts.x ?? 0.62, y: opts.y ?? 0.72, w: opts.w ?? 11.6, h: opts.h ?? 0.9,
    fontFace: HEAD, fontSize: opts.size ?? 34, bold: true,
    color: opts.color ?? INK, margin: 0, valign: "middle",
  });
}

function body(slide, text, o) {
  slide.addText(text, {
    x: o.x, y: o.y, w: o.w, h: o.h ?? 0.9, fontFace: BODY,
    fontSize: o.size ?? 14, color: o.color ?? MUTED, margin: 0,
    lineSpacing: o.lineSpacing ?? 20, valign: o.valign ?? "top", align: o.align ?? "left",
  });
}

function bullets(slide, items, o) {
  slide.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: true, breakLine: i !== items.length - 1 },
    })),
    {
      x: o.x, y: o.y, w: o.w, h: o.h, fontFace: BODY, fontSize: o.size ?? 13.5,
      color: o.color ?? MUTED, margin: 0,
      paraSpaceAfter: o.paraSpaceAfter ?? 9, lineSpacing: o.lineSpacing ?? 19,
    },
  );
}

/** A screenshot in a rounded frame; height comes from the file's own aspect. */
function shot(slide, file, o) {
  const h = o.h ?? high(file, o.w);
  slide.addShape(pres.ShapeType.roundRect, {
    x: o.x - 0.045, y: o.y - 0.045, w: o.w + 0.09, h: h + 0.09,
    rectRadius: 0.06, fill: { color: WHITE }, line: { color: "DDE3EC", width: 0.75 },
    shadow: shadow(),
  });
  slide.addImage({ path: `${S}/${file}`, x: o.x, y: o.y, w: o.w, h });
  if (o.caption) {
    slide.addText(o.caption, {
      x: o.x, y: o.y + h + 0.13, w: o.w, h: 0.32, fontFace: BODY, fontSize: 10.5,
      color: o.captionColor ?? MUTED, italic: true, margin: 0, align: o.captionAlign ?? "left",
    });
  }
  return o.y + h;
}

/* ------------------------------------------------------------------ */
/* 1 · Title                                                           */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  dark(s);
  // Full-bleed right panel: cropped to the panel rather than letterboxed,
  // so the slide has no dead corner under it.
  s.addImage({
    path: `${S}/restricted-zone.png`, x: 7.0, y: 0, w: 6.3, h: 7.5,
    sizing: { type: "cover", w: 6.3, h: 7.5 }, transparency: 12,
  });
  s.addShape(pres.ShapeType.rect, { x: 7.0, y: 0, w: 6.3, h: 7.5, fill: { color: NAVY, transparency: 52 } });

  eyebrow(s, "AI camera safety monitoring · Phase 1 POC", 0.75, 0.95, AMBER, 5.6);
  s.addText("Visual Analysis\nDashboard", {
    x: 0.7, y: 1.5, w: 6.0, h: 2.1, fontFace: HEAD, fontSize: 46, bold: true,
    color: WHITE, margin: 0, lineSpacing: 50,
  });
  body(s, "Nine safety capabilities watching one plant — and a record that says, for every alert, which camera saw it, where, and on whose clock.", {
    x: 0.72, y: 3.85, w: 5.6, size: 15, color: "C6D2E4", lineSpacing: 23, h: 1.3,
  });
  s.addText("Vikas Group  ·  built by Rootstock Technology", {
    x: 0.72, y: 6.35, w: 5.8, h: 0.4, fontFace: BODY, fontSize: 12.5, color: "8FA3C0", margin: 0,
  });
  s.addNotes("Phase 1 proof of concept. Everything shown is the running product, photographed from a real browser driving real footage.");
}

/* ------------------------------------------------------------------ */
/* 2 · At a glance                                                     */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  eyebrow(s, "At a glance", 0.62, 0.5);
  slideTitle(s, "What the system does");

  body(s, "Any camera the plant already has — a phone, a laptop webcam, a network camera, or a recording being reviewed — is watched by nine independent capabilities. Each says what it sees in plain words, raises an alarm aloud when it matters, and files the evidence.", {
    x: 0.62, y: 1.72, w: 6.0, size: 14, lineSpacing: 22, h: 1.7,
  });

  const stats = [
    ["9", "monitoring capabilities", "from restricted zones to face masks"],
    ["3", "ways in", "device camera, recording, network camera"],
    ["11", "verification suites", "every claim measured, not asserted"],
  ];
  stats.forEach(([n, label, sub], i) => {
    const y = 3.45 + i * 1.15;
    s.addText(n, {
      x: 0.62, y, w: 1.05, h: 0.85, fontFace: HEAD, fontSize: 40, bold: true,
      color: AMBER, margin: 0, align: "right", valign: "middle",
    });
    s.addText(label, {
      x: 1.85, y: y + 0.06, w: 4.6, h: 0.36, fontFace: BODY, fontSize: 14.5, bold: true,
      color: INK, margin: 0, valign: "middle",
    });
    s.addText(sub, {
      x: 1.85, y: y + 0.42, w: 4.6, h: 0.34, fontFace: BODY, fontSize: 11.5,
      color: MUTED, margin: 0, valign: "middle",
    });
  });

  shot(s, "dashboard.png", { x: 7.1, y: 1.72, w: 5.6,
    caption: "What is being watched now, and what needs attention." });
  s.addNotes("The three ways in matter commercially: no new hardware is required to trial this.");
}

/* ------------------------------------------------------------------ */
/* 3 · Restricted zones                                                */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  eyebrow(s, "Capability", 0.62, 0.5);
  slideTitle(s, "Restricted zones, by name");

  shot(s, "restricted-zone.png", { x: 0.62, y: 1.62, w: 7.55 });

  bullets(s, [
    "Mark as many zones as the floor needs — each one named.",
    "The alarm says the name aloud: “Person is in restricted zone Loading bay.”",
    "Standing in a zone is told from walking in front of it, using body position and apparent size.",
    "While somebody is inside, the zone counts how long they have been there.",
  ], { x: 8.55, y: 1.72, w: 4.15, h: 3.0 });

  shot(s, "zone-occupancy-trim.png", { x: 8.55, y: 5.0, w: 4.15,
    caption: "The zone list, counting an intrusion live." });
  s.addNotes("Zones belong to the camera they were drawn on — switching cameras hides a set rather than deleting it.");
}

/* ------------------------------------------------------------------ */
/* 4 · Walkways + doors                                                */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  eyebrow(s, "Capabilities", 0.62, 0.5);
  slideTitle(s, "Blocked walkways, open doors");

  shot(s, "walkways.png", { x: 0.62, y: 1.62, w: 5.8,
    caption: "A marked lane that has to stay clear." });
  shot(s, "door.png", { x: 6.9, y: 1.62, w: 5.8,
    caption: "Each doorway marked and named, then timed." });

  body(s, "The walkway detector carries no object model. It learns what the marked lane's own floor looks like and reports what is not it — which is why it finds a cardboard box nothing was trained on. People are cut out before the floor is judged.", {
    x: 0.62, y: 5.9, w: 5.8, size: 12, lineSpacing: 17, h: 1.1,
  });
  body(s, "Doors are watched per doorway, each with its own allowed open time. A state has to be argued for across frames before it is believed, and a doorway whose evidence keeps flipping is called unreliable rather than guessed at.", {
    x: 6.9, y: 5.9, w: 5.8, size: 12, lineSpacing: 17, h: 1.1,
  });
}

/* ------------------------------------------------------------------ */
/* 5 · PPE family                                                      */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  eyebrow(s, "Capabilities", 0.62, 0.5);
  slideTitle(s, "Gear, gloves, masks, faces");

  shot(s, "ppe.png", { x: 6.55, y: 1.62, w: 6.15 });

  const rows = [
    ["Safety gear", "Helmet and vest, checked per person, with a count of who is missing what."],
    ["Gloves", "Bare hands where gloves are required — attributed to the person they belong to."],
    ["Face masks", "Checked only once there is head evidence, so a back turned is never an accusation."],
    ["Face recognition", "Registered people announced by name the moment they appear on any input."],
  ];
  rows.forEach(([h, d], i) => {
    const y = 1.72 + i * 1.16;
    s.addShape(pres.ShapeType.ellipse, { x: 0.62, y: y + 0.05, w: 0.3, h: 0.3, fill: { color: "FDEBCB" }, line: { color: "FDEBCB" } });
    s.addShape(pres.ShapeType.ellipse, { x: 0.715, y: y + 0.145, w: 0.11, h: 0.11, fill: { color: AMBER }, line: { color: AMBER } });
    s.addText(h, { x: 1.08, y, w: 4.9, h: 0.36, fontFace: BODY, fontSize: 14.5, bold: true, color: INK, margin: 0, valign: "middle" });
    s.addText(d, { x: 1.08, y: y + 0.36, w: 5.1, h: 0.6, fontFace: BODY, fontSize: 12, color: MUTED, margin: 0, lineSpacing: 16 });
  });

  body(s, "A weak detection can raise a question, never grant a green tick.", {
    x: 6.55, y: 5.78, w: 6.15, size: 12.5, color: INK, lineSpacing: 18, h: 0.5,
  });
}

/* ------------------------------------------------------------------ */
/* 6 · Workstations                                                    */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  eyebrow(s, "Capability", 0.62, 0.5);
  slideTitle(s, "Workstations, hour by hour");

  shot(s, "workstation-graph.png", { x: 0.62, y: 1.62, w: 7.9 });

  bullets(s, [
    "Each place somebody should be is marked and named.",
    "It alerts by name once nobody has been there for longer than the allowance.",
    "The page graphs the recent record: manned, idle, and not watched — three different things.",
    "Time nobody could watch is drawn as a hole, never counted as either.",
  ], { x: 8.85, y: 1.72, w: 3.85, h: 3.1 });

  body(s, "The real alert time is the allowance plus four seconds — the pause that stops a seated person who holds still from being reported absent. It is stated on the page rather than hidden.", {
    x: 8.85, y: 5.05, w: 3.85, size: 12, lineSpacing: 17, h: 1.5,
  });
}

/* ------------------------------------------------------------------ */
/* 7 · The clock in the footage                                        */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  eyebrow(s, "New", 0.62, 0.5);
  slideTitle(s, "The clock the footage carries");

  body(s, "CCTV burns its own clock into the picture. When a recording is reviewed days later, that clock — not the moment of review — is what the event should carry.", {
    x: 0.62, y: 1.68, w: 6.3, size: 14, color: INK, lineSpacing: 21, h: 1.1,
  });

  bullets(s, [
    "The burned-in timestamp is read from the picture and validated before it is believed.",
    "A clock that jumps backwards is treated as misread; one unreadable frame decides nothing.",
    "Reading is sampled and extrapolated through the video's own position, so it costs almost nothing.",
    "No readable clock anywhere? The system clock stamps the event — and the record says so.",
  ], { x: 0.62, y: 3.0, w: 6.3, h: 3.0 });

  shot(s, "event-detail-trim.png", { x: 7.9, y: 1.58, w: 4.2,
    caption: "Filed under the recording's own clock." });
  s.addNotes("Server timestamp 18 August; the event is filed under 6 August because that is what the footage says. Both are kept, plus the raw text that was read.");
}

/* ------------------------------------------------------------------ */
/* 8 · When a camera has no clock                                      */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  eyebrow(s, "New", 0.62, 0.5);
  slideTitle(s, "When a camera has no clock");

  shot(s, "clock-warning-trim.png", { x: 0.62, y: 1.62, w: 4.5,
    caption: "The camera says so on the page it is watched from." });

  body(s, "Not every camera offers a clock, and a system that quietly falls back is a system nobody can reconcile with an ERP later. So the camera's clock has a state of its own, separate from the timestamp that ends up on the event.", {
    x: 5.55, y: 1.68, w: 7.15, size: 13.5, color: INK, lineSpacing: 20, h: 1.4,
  });

  const states = [
    ["Valid", "A timestamp is being read and agrees with itself.", "2E7D5B"],
    ["Checking", "Still looking — the verdict is not in yet.", MUTED],
    ["Unavailable", "The whole check window passed with nothing found.", AMBER],
    ["Invalid", "The clock jumped backwards and cannot be trusted.", RED],
  ];
  states.forEach(([name, what, tone], i) => {
    const y = 3.25 + i * 0.72;
    s.addShape(pres.ShapeType.roundRect, {
      x: 5.55, y, w: 1.62, h: 0.5, rectRadius: 0.1,
      fill: { color: WHITE }, line: { color: tone, width: 1 },
    });
    s.addText(name, { x: 5.55, y, w: 1.62, h: 0.5, fontFace: BODY, fontSize: 12.5, bold: true, color: tone, align: "center", valign: "middle", margin: 0 });
    s.addText(what, { x: 7.35, y, w: 5.35, h: 0.5, fontFace: BODY, fontSize: 12.5, color: MUTED, valign: "middle", margin: 0 });
  });

  body(s, "One warning per camera, not one per frame — and it resolves itself the moment a clock appears. Watching and detection never pause for any of it.", {
    x: 5.55, y: 6.3, w: 7.15, size: 12.5, color: INK, lineSpacing: 18, h: 0.7,
  });
}

/* ------------------------------------------------------------------ */
/* 9 · Camera register                                                 */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  eyebrow(s, "Capability", 0.62, 0.5);
  slideTitle(s, "Every alert names its camera");

  shot(s, "camera-register.png", { x: 0.62, y: 1.62, w: 5.8,
    caption: "Asked once, the first time a camera is started." });
  shot(s, "cameras.png", { x: 6.9, y: 1.62, w: 5.8,
    caption: "The register: name, place, status, and clock health." });

  body(s, "A camera is named and placed once. From then on it is recognised by the most stable identifier its kind can honestly offer, starts under its own name, and every safety event carries which camera saw it and where — with the camera's own clock recorded beside the server's, and a visible warning when the two disagree.", {
    x: 0.62, y: 5.95, w: 12.05, size: 13, lineSpacing: 19, h: 1.0,
  });
}

/* ------------------------------------------------------------------ */
/* 10 · Events and reports                                             */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: PAPER };
  eyebrow(s, "The record", 0.62, 0.5);
  slideTitle(s, "The record, and what it adds up to");

  shot(s, "events.png", { x: 0.62, y: 1.62, w: 5.8,
    caption: "Safety events, each with the picture that proves it." });
  shot(s, "reports.png", { x: 6.9, y: 1.62, w: 5.8,
    caption: "Counts by capability and by day, exportable for Excel." });

  bullets(s, [
    "A situation that lasts is one escalating event, not a thousand rows.",
    "Periods reach a year, so archive footage stays reachable.",
  ], { x: 0.62, y: 5.95, w: 5.8, h: 1.0, size: 12, lineSpacing: 17, paraSpaceAfter: 7 });
  bullets(s, [
    "Every event says which clock stamped it, and how that camera's clock stood.",
    "An export stops at its newest 500 rows — and the page says so.",
  ], { x: 6.9, y: 5.95, w: 5.8, h: 1.0, size: 12, lineSpacing: 17, paraSpaceAfter: 7 });
}

/* ------------------------------------------------------------------ */
/* 11 · How it is verified                                             */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  dark(s);
  eyebrow(s, "How it is verified", 0.62, 0.5, AMBER);
  slideTitle(s, "Every claim here is measured", { color: WHITE });

  body(s, "Fifty-one defects were found in the original build and each was fixed against a check that fails if it returns. Eleven suites drive the running product — not mocks — and every capability added since arrives with its own.", {
    x: 0.62, y: 1.85, w: 6.1, size: 14, color: "C6D2E4", lineSpacing: 22, h: 1.6,
  });

  const facts = [
    ["Six phase suites", "truth-telling, state, uncertainty, geometry, belief, surfaces"],
    ["Five capability suites", "zones, walkways, workstations, camera register, timestamps"],
    ["Real browsers, real footage", "pixels, sockets and spoken alerts, not JSON alone"],
  ];
  facts.forEach(([h, d], i) => {
    const y = 3.75 + i * 1.05;
    s.addShape(pres.ShapeType.ellipse, { x: 0.62, y: y + 0.06, w: 0.28, h: 0.28, fill: { color: AMBER }, line: { color: AMBER } });
    s.addText(h, { x: 1.06, y, w: 5.5, h: 0.36, fontFace: BODY, fontSize: 14, bold: true, color: WHITE, margin: 0, valign: "middle" });
    s.addText(d, { x: 1.06, y: y + 0.36, w: 5.5, h: 0.34, fontFace: BODY, fontSize: 11.5, color: "8FA3C0", margin: 0, valign: "middle" });
  });

  shot(s, "clock-valid-trim.png", { x: 7.35, y: 1.9, w: 5.3,
    caption: "The product says what it is doing, in words an operator can act on.",
    captionColor: "8FA3C0" });
}

/* ------------------------------------------------------------------ */
/* 12 · Honest limits                                                  */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  eyebrow(s, "Known limits", 0.62, 0.5, RED);
  slideTitle(s, "What it cannot do yet");

  const limits = [
    ["Trained on other people's data", "The forklift weights know one class and were measured on two clips of one warehouse. On a site they have not seen, check the setting before trusting it."],
    ["Colour-blind on the floor", "The walkway detector finds what is not floor — so an object the same colour as the floor beneath it is invisible to it."],
    ["A burned clock names no timezone", "So it is stored and shown exactly as the footage shows it, never converted to yours."],
    ["Glass doors", "Reflections read as open. The evidence is recorded rather than papered over; it needs footage and retraining, not code."],
  ];
  limits.forEach(([h, d], i) => {
    const x = 0.62 + (i % 2) * 6.35;
    const y = 1.72 + Math.floor(i / 2) * 2.3;
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w: 5.95, h: 2.0, rectRadius: 0.08,
      fill: { color: PAPER }, line: { color: "E3E8F0", width: 0.75 },
    });
    s.addText(h, { x: x + 0.32, y: y + 0.26, w: 5.3, h: 0.36, fontFace: BODY, fontSize: 14, bold: true, color: INK, margin: 0 });
    s.addText(d, { x: x + 0.32, y: y + 0.62, w: 5.3, h: 1.1, fontFace: BODY, fontSize: 12, color: MUTED, margin: 0, lineSpacing: 17 });
  });

  body(s, "Every one of these is measured and written down. A limit somebody knows about is a plan; a limit nobody mentions is an incident.", {
    x: 0.62, y: 6.55, w: 12.05, size: 13, color: INK, lineSpacing: 18, h: 0.5,
  });
}

/* ------------------------------------------------------------------ */
/* 13 · Close                                                          */
/* ------------------------------------------------------------------ */
{
  const s = pres.addSlide();
  dark(s);
  eyebrow(s, "Phase 1 · proof of concept", 0.92, 2.0, AMBER, 5.6);
  s.addText("Ready to watch a real floor", {
    x: 0.9, y: 2.45, w: 9.5, h: 1.0, fontFace: HEAD, fontSize: 40, bold: true, color: WHITE, margin: 0,
  });
  body(s, "Runs on the cameras already in the building, on a laptop or a GPU in Colab. Nine capabilities, one record, and an honest account of what it can and cannot see.", {
    x: 0.92, y: 3.7, w: 7.6, size: 15, color: "C6D2E4", lineSpacing: 24, h: 1.4,
  });
  s.addText("Rootstock Technology  ·  for Vikas Group", {
    x: 0.92, y: 5.4, w: 8, h: 0.4, fontFace: BODY, fontSize: 13, color: AMBER, margin: 0,
  });
}

pres.writeFile({ fileName: OUT }).then((f) => console.log("wrote", f));
