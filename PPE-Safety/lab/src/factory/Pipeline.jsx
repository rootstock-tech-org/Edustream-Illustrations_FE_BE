import { AlertTriangle, ArrowRight, Check, Clock, Minus, X } from "lucide-react";

import { read } from "../engine/legibility.js";
import FactoryCanvas from "./FactoryCanvas.jsx";

/**
 * AI Analysis Pipeline (Live) — the five stages the system runs on every
 * frame, each showing what it produced on the frame the floor is showing.
 *
 *   Camera Frame → Object Detection → PPE Check → Safety Rules → Decision
 *
 * The two thumbnails are the floor itself, re-rendered without the operator
 * overlay (the raw picture) and with only the model's boxes (what the
 * detector returned). The PPE card follows the selected worker, or the
 * worker the rules are most concerned about; the rules card summarises every
 * check; the decision is the frame's own verdict.
 */
export default function Pipeline({ world, result, conditions, bars, selectedId }) {
  // Live off the conditions, like the floor itself — the decision card must
  // never read "all clear" on a picture the camera can no longer see, paused
  // or running.
  const reading = read(conditions);
  const readable = reading.readable;
  const detections = result?.detections ?? [];
  const findings = result?.findings ?? [];

  const persons = findings.filter((finding) => finding.kind === "person");
  const focus =
    persons.find((finding) => finding.id === selectedId)
    ?? persons.find((finding) => finding.settled === "violation")
    ?? persons.find((finding) => finding.settled === "watching")
    ?? persons[0]
    ?? null;
  const focusDetection = focus ? detections.find((detection) => detection.id === focus.id) : null;

  const gearRows = ["helmet", "vest", "gloves", "mask"].map((item) => {
    const required = bars.requires.includes(item);
    const judged = focus?.items?.find((entry) => entry.item === item) ?? null;
    const score = focusDetection?.items?.[item];
    if (!required) return { item, state: "na", text: item === "mask" ? "—" : score !== undefined ? score.toFixed(2) : "—" };
    if (!focus || focus.settled === "lost" || focus.settled === "unverified") return { item, state: "na", text: "—" };
    if (!judged) return { item, state: "na", text: "—" };
    return { item, state: judged.worn ? "ok" : "bad", text: judged.score.toFixed(2) };
  });

  const zoneFindings = findings.filter((finding) => finding.kind === "zone");
  const ruleRows = [
    rule("Zone Check", zoneFindings.filter((zone) => zone.zoneType !== "walkway")),
    rule("PPE Check", persons),
    rule("Walkway Check", zoneFindings.filter((zone) => zone.zoneType === "walkway")),
    rule("Door Check", findings.filter((finding) => finding.kind === "door")),
    rule("Station Check", findings.filter((finding) => finding.kind === "workstation")),
  ];

  const violations = findings.filter((finding) => finding.settled === "violation").length;
  const checking = findings.filter((finding) => finding.settled === "watching").length;
  const lost = findings.filter((finding) => finding.settled === "lost").length;

  const decision = !readable
    ? { tone: "hazard", Icon: AlertTriangle, title: "Cannot check", sub: reading.reason ?? "" }
    : lost > 0
      ? { tone: "hazard", Icon: AlertTriangle, title: `${lost} not seen`, sub: "somebody the model lost — not all clear" }
      : violations > 0
        ? { tone: "violation", Icon: AlertTriangle, title: `${violations} Violation${violations === 1 ? "" : "s"}`, sub: checking ? `${checking} more being checked` : "confirmed and raised" }
        : checking > 0
          ? { tone: "hazard", Icon: Clock, title: "Checking", sub: `${checking} accusation${checking === 1 ? "" : "s"} gathering sightings` }
          : { tone: "clear", Icon: Check, title: "No Violation", sub: "and the picture was good enough to mean it" };

  const thumbWorld = world;

  return (
    /*
      `min-w-0` is load-bearing. This section is a grid item, and a grid
      item's default `min-width: auto` refuses to shrink below its own
      content — which the strip inside deliberately holds at 720px. Left to
      default the section grew past its column instead of letting the strip
      scroll, and slid under the detail panel beside it. Zero here is what
      lets the column win and the scrolling actually happen.
    */
    <section className="panel min-w-0 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">AI Analysis Pipeline (Live)</h2>
        <span className="machine text-[11px] text-ink-faint">frame {result?.frame ?? 0}</span>
      </div>

      {/*
        Five stages side by side, and they only mean anything read in order,
        so they are never allowed to wrap or to crush. Each card has a floor
        under its width; when the panel is narrower than the five of them the
        strip scrolls inside itself rather than squeezing "Camera Frame" down
        to "C..". The scroll stays in this container, so the page itself
        never moves sideways.
      */}
      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[720px] grid-cols-[minmax(128px,1fr)_auto_minmax(128px,1fr)_auto_minmax(128px,1fr)_auto_minmax(128px,1fr)_auto_minmax(128px,1fr)] items-stretch gap-1.5">
        <Card title="Camera Frame" state="ok">
          <div className="overflow-hidden rounded-md border border-line">
            <FactoryCanvas world={thumbWorld} result={result} conditions={conditions} bars={bars} readOnly mode="frame" />
          </div>
          <div className="mt-1 text-[11px] text-ink-faint">{readable ? "readable" : "unreadable"}</div>
        </Card>
        <Arrow ok={readable} />
        <Card title="Object Detection" state={readable ? "ok" : "skip"}>
          <div className="overflow-hidden rounded-md border border-line">
            <FactoryCanvas world={thumbWorld} result={result} conditions={conditions} bars={bars} readOnly mode="detect" />
          </div>
          <div className="mt-1 text-[11px] text-ink-faint">
            {readable ? `${detections.length} objects · ${persons.length} people` : "not run"}
          </div>
        </Card>
        <Arrow ok={readable} />
        <Card title="PPE Check" state={readable ? "ok" : "skip"} sub={focus?.name ?? "no worker"}>
          <div className="flex flex-wrap gap-1">
            {gearRows.map((row) => (
              <Chip key={row.item} state={readable ? row.state : "na"} label={row.item === "vest" ? "Vest" : row.item[0].toUpperCase() + row.item.slice(1)} value={readable ? row.text : "—"} />
            ))}
          </div>
        </Card>
        <Arrow ok={readable} />
        <Card title="Safety Rules" state={readable ? "ok" : "skip"}>
          <ul className="space-y-1">
            {ruleRows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-ink-dim" title={row.label}>{row.label}</span>
                <RuleMark state={readable ? row.state : "na"} />
              </li>
            ))}
          </ul>
        </Card>
        <Arrow ok={readable} />
        <Card title="Decision" state={readable ? "ok" : "skip"}>
          <div className="flex h-full flex-col items-center justify-center py-2 text-center">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full ${toneBg(decision.tone)}`}>
              <decision.Icon size={18} className={toneText(decision.tone)} />
            </span>
            <span className={`mt-2 text-sm font-semibold ${toneText(decision.tone)}`}>{decision.title}</span>
            <span className="mt-0.5 text-[10px] leading-tight text-ink-faint">{decision.sub}</span>
          </div>
        </Card>
        </div>
      </div>
    </section>
  );
}

function rule(label, findings) {
  if (findings.length === 0) return { label, state: "none" };
  if (findings.some((finding) => finding.settled === "violation")) return { label, state: "bad" };
  if (findings.some((finding) => finding.settled === "watching")) return { label, state: "checking" };
  if (findings.some((finding) => finding.settled === "lost" || finding.settled === "unverified")) return { label, state: "unsure" };
  return { label, state: "ok" };
}

function Card({ title, sub, state, children }) {
  return (
    <div className={`inset flex min-w-0 flex-col p-2.5 ${state === "skip" ? "opacity-50" : ""}`}>
      <div className="mb-1.5 min-w-0">
        <div className="truncate text-[11px] font-semibold text-ink" title={title}>{title}</div>
        {sub && <div className="truncate text-[10px] text-ink-faint" title={sub}>{sub}</div>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Arrow({ ok }) {
  return (
    <div className="flex items-center justify-center px-0.5">
      <ArrowRight size={16} className={ok ? "text-vision" : "text-ink-faint"} />
    </div>
  );
}

function Chip({ state, label, value }) {
  const cls =
    state === "ok"
      ? "border-clear/50 bg-clear-dim text-clear"
      : state === "bad"
        ? "border-violation/60 bg-violation-dim text-violation"
        : "border-line bg-panel text-ink-faint";
  const Icon = state === "ok" ? Check : state === "bad" ? X : Minus;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
      <Icon size={10} />
      <span className="machine">{value}</span>
    </span>
  );
}

function RuleMark({ state }) {
  if (state === "bad") return <AlertTriangle size={12} className="shrink-0 text-violation" />;
  if (state === "checking") return <Clock size={12} className="shrink-0 text-hazard" />;
  if (state === "unsure") return <Minus size={12} className="shrink-0 text-unknown" />;
  if (state === "ok") return <Check size={12} className="shrink-0 text-clear" />;
  return <Minus size={12} className="shrink-0 text-ink-faint" />;
}

function toneBg(tone) {
  return tone === "clear" ? "bg-clear-dim" : tone === "violation" ? "bg-violation-dim" : "bg-hazard-dim";
}

function toneText(tone) {
  return tone === "clear" ? "text-clear" : tone === "violation" ? "text-violation" : "text-hazard";
}
