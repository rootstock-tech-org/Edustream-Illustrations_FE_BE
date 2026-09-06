import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, HelpCircle, Minus, MousePointerClick, Trash2, X } from "lucide-react";

import { explain } from "../engine/explain.js";
import { KINDS, ZONE_TYPES, zonesContaining } from "../engine/world.js";
import { clock, gridRef } from "../floor/labels.js";
import { ThingArt } from "./objects.jsx";

/**
 * Selected: <thing> — everything the system knows about one thing on the
 * floor: what the model scored, what the rules concluded, why, and where it
 * is. Every number is the engine's own for this frame.
 */
export default function SelectedPanel({ ctx, onClose, onToggleGear, onToggleDoor, onRemove, onRemoveZone }) {
  const { world, result, selectedId, bars, fps, openEvents, zoneSince, readable, reading } = ctx;
  const thing = world.things.find((entry) => entry.id === selectedId) ?? null;
  const zone = !thing ? world.zones.find((entry) => entry.id === selectedId) ?? null : null;

  if (!thing && !zone) {
    return (
      <aside className="panel flex flex-col p-4">
        <h2 className="text-sm font-semibold text-ink">Selected: nothing</h2>
        <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
          <MousePointerClick size={22} className="text-ink-faint" />
          <p className="mt-3 max-w-[220px] text-xs leading-relaxed text-ink-faint">
            Click a worker, the forklift, a crate, the door or the workstation to see what the AI
            detects, what the rules make of it, and why. Drag to move it.
          </p>
        </div>
      </aside>
    );
  }

  if (zone) return <ZoneDetails zone={zone} ctx={ctx} onClose={onClose} onRemove={onRemoveZone} />;

  const finding = result?.findings.find((entry) => entry.id === thing.id) ?? null;
  const detection = result?.detections.find((entry) => entry.id === thing.id) ?? null;
  const zoneFindings = (result?.findings ?? []).filter((entry) => entry.kind === "zone");
  const judging = zoneFindings.filter((entry) => (entry.inside ?? []).some((inside) => inside.id === thing.id));
  const inZones = zonesContaining(thing, world.zones);
  const since = zoneSince?.[thing.id] ?? null;
  const at = result?.at ?? 0;

  const status = !readable
    ? { label: "Not judged", cls: "border-hazard/60 bg-hazard-dim text-hazard" }
    : thing.kind === KINDS.CAMERA
      ? { label: "Active", cls: "border-clear/50 bg-clear-dim text-clear" }
      : thing.kind === KINDS.DOOR || thing.kind === KINDS.WORKSTATION
        ? { label: "Tracked", cls: "border-vision/50 bg-vision-dim text-vision" }
        : detection && detection.score >= bars.personSeen
          ? { label: "Detected", cls: "border-clear/50 bg-clear-dim text-clear" }
          : { label: "Not detected", cls: "border-line bg-panel text-ink-faint" };

  const verdict = verdictOf({ thing, finding, judging, readable, bars, detection });

  return (
    <aside className="panel flex flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          Selected: <span className="text-vision">{thing.label ?? thing.kind}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-faint hover:bg-panel-raised hover:text-ink">
          <X size={15} />
        </button>
      </div>

      <div className="mt-3 flex gap-3">
        <Portrait thing={thing} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-ink">{thing.label ?? thing.kind}</div>
          <span className={`mt-1 inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.label}</span>
          <div className="mt-2 text-[11px] leading-relaxed text-ink-faint">{KIND_NAMES[thing.kind]}</div>
        </div>
      </div>

      <h3 className="mt-4 text-xs font-semibold text-ink">Detection</h3>
      <ul className="mt-1.5 space-y-1.5 text-xs">
        {thing.kind === KINDS.WORKER && (
          <>
            <Row dot={dotFor(readable && detection ? (detection.score >= bars.personSure ? "ok" : detection.score >= bars.personSeen ? "warn" : "bad") : "na")} label="Person" value={readable && detection ? detection.score.toFixed(2) : "—"} />
            {["helmet", "vest", "gloves"].map((item) => {
              const required = bars.requires.includes(item);
              const judged = finding?.items?.find((entry) => entry.item === item) ?? null;
              const score = readable && detection ? detection.items?.[item] : undefined;
              const worn = thing.wearing.includes(item);
              const dot = !readable || score === undefined ? "na" : !required ? "na" : judged ? (judged.worn ? "ok" : "bad") : "na";
              return (
                <Row
                  key={item}
                  dot={dotFor(dot)}
                  label={item === "vest" ? "Safety Vest" : item[0].toUpperCase() + item.slice(1)}
                  value={
                    !required ? "Not required" : score !== undefined ? `${score.toFixed(2)}${judged?.kept ? " · kept" : ""}` : "—"
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => onToggleGear(thing.id, item)}
                      className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-dim hover:border-line-strong hover:text-ink"
                    >
                      {worn ? "Remove" : "Put on"}
                    </button>
                  }
                />
              );
            })}
            <Row dot={dotFor("na")} label="Mask" value="Not required" />
          </>
        )}
        {thing.kind === KINDS.FORKLIFT && (
          <Row dot={dotFor(readable && detection ? "ok" : "na")} label="Vehicle" value={readable && detection ? detection.score.toFixed(2) : "—"} />
        )}
        {thing.kind === KINDS.OBJECT && (
          <Row dot={dotFor(readable && detection ? "ok" : "na")} label="Object" value={readable && detection ? detection.score.toFixed(2) : "—"} />
        )}
        {thing.kind === KINDS.DOOR && (
          <>
            <Row dot={dotFor(thing.open ? "warn" : "ok")} label="Door state" value={thing.open ? "Open" : "Closed"} action={
              <button type="button" onClick={() => onToggleDoor(thing.id)} className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-dim hover:border-line-strong hover:text-ink">
                {thing.open ? "Close" : "Open"}
              </button>
            } />
            <Row dot={dotFor("na")} label="Open for" value={finding ? `${finding.openSeconds.toFixed(1)} s / ${bars.doorOpenSeconds} s` : "—"} />
          </>
        )}
        {thing.kind === KINDS.WORKSTATION && (
          <>
            <Row dot={dotFor(finding?.nearby?.length ? "ok" : "warn")} label="Presence" value={finding?.nearby?.length ? finding.nearby.map((entry) => entry.name).join(", ") : "nobody seen"} />
            <Row dot={dotFor("na")} label="Empty for" value={finding ? `${finding.emptySeconds.toFixed(0)} s / ${bars.stationEmptySeconds} s` : "—"} />
          </>
        )}
        {thing.kind === KINDS.CAMERA && (
          <>
            <Row dot={dotFor("ok")} label="Frames a second" value={String(fps)} />
            <Row dot={dotFor(readable ? "ok" : "bad")} label="Picture" value={readable ? "readable" : reading?.reason ?? "unreadable"} />
          </>
        )}
      </ul>

      <h3 className="mt-4 text-xs font-semibold text-ink">Current Verdict</h3>
      <div className="mt-1.5 flex items-start gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${verdict.bg}`}>
          <verdict.Icon size={14} className={verdict.text} />
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${verdict.text}`}>{verdict.title}</div>
          <div className="text-[11px] leading-snug text-ink-dim">{verdict.sub}</div>
        </div>
      </div>

      {thing.kind !== KINDS.CAMERA && thing.kind !== KINDS.OBJECT && thing.kind !== KINDS.FORKLIFT && (
        <Why finding={finding} result={result} openEvents={openEvents} fps={fps} bars={bars} thing={thing} judging={judging} />
      )}

      <h3 className="mt-4 text-xs font-semibold text-ink">Movement</h3>
      <ul className="mt-1.5 space-y-1.5 text-xs">
        <Row label="Location" value={gridRef(thing.x, thing.y)} />
        <Row label="In Restricted Zone" value={inZones.some((entry) => entry.type === "restricted" || entry.type === "lifting") ? "Yes" : "No"} />
        <Row label="In Walkway" value={inZones.some((entry) => entry.type === "walkway") ? "Yes" : "No"} />
        <Row label="Time in Area" value={since && inZones.length > 0 ? clock(at - since.since) : "—"} />
      </ul>

      {thing.kind !== KINDS.CAMERA && (
        <button
          type="button"
          onClick={() => onRemove(thing.id)}
          className="mt-4 inline-flex items-center gap-1.5 self-start text-[11px] text-ink-faint transition-colors hover:text-violation"
        >
          <Trash2 size={11} />
          Remove from floor
        </button>
      )}
    </aside>
  );
}

const KIND_NAMES = {
  [KINDS.WORKER]: "Person · judged for helmet and vest, and for where they stand",
  [KINDS.FORKLIFT]: "Vehicle · no rule of its own; a marked area judges where it is",
  [KINDS.OBJECT]: "Object · a crate; only a walkway judges it",
  [KINDS.DOOR]: "Door · timed while open",
  [KINDS.WORKSTATION]: "Workstation · timed while nobody is at it",
  [KINDS.CAMERA]: "Camera · the sensor everything starts from",
};

/** Where an accusation stands — the count, then the majority it still needs. */
function sightings(votes) {
  if (!votes) return "gathering sightings.";
  return votes.accusing < votes.needed
    ? `${votes.accusing} of ${votes.needed} agreeing sightings before an accusation is raised.`
    : `${votes.accusing} agreeing sightings — still outnumbered by earlier clear ones; it needs two to one over the last 1.5 s.`;
}

function verdictOf({ thing, finding, judging, readable, bars, detection }) {
  const ok = { Icon: Check, bg: "bg-clear-dim", text: "text-clear" };
  const bad = { Icon: AlertTriangle, bg: "bg-violation-dim", text: "text-violation" };
  const wait = { Icon: Clock, bg: "bg-hazard-dim", text: "text-hazard" };
  const na = { Icon: Minus, bg: "bg-panel-raised", text: "text-ink-faint" };

  if (!readable) return { ...wait, title: "Not judged", sub: "The picture cannot be read, so nothing on this floor is being judged." };

  const zoneBreach = judging.find((zone) => zone.settled === "violation");
  const zoneWatch = judging.find((zone) => zone.settled === "watching");

  if (thing.kind === KINDS.WORKER) {
    if (!finding) return { ...na, title: "No finding", sub: "Nothing was judged for this person on this frame." };
    if (finding.settled === "lost") return { ...wait, title: "Not detected", sub: `Scored ${finding.score.toFixed(2)}, under the ${bars.personSeen.toFixed(2)} bar for being reported at all.` };
    if (finding.settled === "unverified") return { ...wait, title: "Unverified", sub: `Scored ${finding.score.toFixed(2)} — seen, but under the ${bars.personSure.toFixed(2)} bar for being judged.` };
    if (zoneBreach) return { ...bad, title: `Inside ${zoneBreach.name}`, sub: `${ZONE_TYPES[zoneBreach.zoneType]?.watches ?? ""}` };
    if (finding.settled === "violation") {
      const missing = (finding.items ?? []).filter((entry) => !entry.worn);
      return { ...bad, title: "Violation", sub: `${missing.map((entry) => `${entry.item} missing (${entry.score.toFixed(2)} < ${bars.itemGrant.toFixed(2)})`).join("; ")}.` };
    }
    if (zoneWatch) return { ...wait, title: `Entering ${zoneWatch.name}`, sub: sightings(zoneWatch.votes) };
    if (finding.settled === "watching") return { ...wait, title: "Checking", sub: sightings(finding.votes) };
    return { ...ok, title: "Compliant", sub: "All required PPE detected." };
  }
  if (thing.kind === KINDS.FORKLIFT || thing.kind === KINDS.OBJECT) {
    if (zoneBreach) return { ...bad, title: thing.kind === KINDS.OBJECT ? `Blocking ${zoneBreach.name}` : `Inside ${zoneBreach.name}`, sub: ZONE_TYPES[zoneBreach.zoneType]?.watches ?? "" };
    if (zoneWatch) return { ...wait, title: `Entering ${zoneWatch.name}`, sub: sightings(zoneWatch.votes) };
    if (!detection) return { ...na, title: "Not detected", sub: "The model did not report it this frame." };
    return { ...ok, title: "No violation", sub: "Not inside any area that watches for it." };
  }
  if (thing.kind === KINDS.DOOR) {
    if (!finding) return { ...na, title: "—", sub: "" };
    if (finding.settled === "violation") return { ...bad, title: `Open too long · ${finding.severity}`, sub: `${finding.openSeconds.toFixed(1)} s open against a ${bars.doorOpenSeconds} s allowance.` };
    if (finding.settled === "watching") return { ...wait, title: "Checking", sub: `Past the allowance — ${sightings(finding.votes)}` };
    if (thing.open) return { ...wait, title: "Open", sub: `${finding.openSeconds.toFixed(1)} s of the ${bars.doorOpenSeconds} s allowance.` };
    return { ...ok, title: "Closed", sub: "Nothing to time." };
  }
  if (thing.kind === KINDS.WORKSTATION) {
    if (!finding) return { ...na, title: "—", sub: "" };
    if (finding.settled === "violation") return { ...bad, title: `Unattended · ${finding.severity}`, sub: `${finding.emptySeconds.toFixed(0)} s empty against a ${bars.stationEmptySeconds} s allowance.` };
    if (finding.settled === "watching") return { ...wait, title: "Checking", sub: `Past the allowance — ${sightings(finding.votes)}` };
    if (finding.nearby?.length) return { ...ok, title: "Attended", sub: `${finding.nearby.map((entry) => entry.name).join(", ")} at the station.` };
    if (finding.emptySeconds > 0) return { ...wait, title: "Empty", sub: `${finding.emptySeconds.toFixed(0)} s of the ${bars.stationEmptySeconds} s allowance.` };
    return { ...wait, title: "Nobody seen", sub: `Still counted as attended for ${bars.stationPresenceGrace} s of grace.` };
  }
  return { ...ok, title: "Active", sub: "Watching the floor." };
}

function Why({ finding, result, openEvents, fps, bars, thing, judging }) {
  const [open, setOpen] = useState(false);
  if (!result || !finding) return null;
  const key = `${finding.kind}:${finding.id}`;
  const events = Object.values(openEvents ?? {}).filter((event) => event.key.startsWith(`${thing.id}:`));
  const account = open ? explain(result, key, { events, fps }, bars) : null;
  const zoneAccounts = open
    ? judging.map((zone) => ({
        zone,
        account: explain(result, `zone:${zone.id}`, { events: Object.values(openEvents ?? {}).filter((event) => event.key === `zone:${zone.id}`), fps }, bars),
      }))
    : [];

  return (
    <div className="mt-3 rounded-lg border border-line">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink"
      >
        <HelpCircle size={13} className="text-ink-faint" />
        Why?
        <ChevronDown size={13} className={`ml-auto text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {account && (
        <div className="border-t border-line px-3 py-2">
          <ol className="space-y-1.5">
            {account.points.map((point) => (
              <Point key={point.n} point={point} />
            ))}
          </ol>
          {zoneAccounts.map(({ zone, account: za }) => (
            <div key={zone.id} className="mt-2 border-t border-line pt-2">
              <div className="eyebrow mb-1">{zone.name}</div>
              <ol className="space-y-1.5">
                {za.points.map((point) => <Point key={point.n} point={point} />)}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Point({ point }) {
  const Icon = point.ok === true ? Check : point.ok === false ? X : Minus;
  const tone = point.ok === true ? "text-clear" : point.ok === false ? "text-violation" : "text-ink-faint";
  return (
    <li className="flex gap-1.5 text-[11px] leading-relaxed">
      <span className="machine mt-0.5 shrink-0 text-ink-faint">{point.n}.</span>
      <Icon size={11} className={`mt-0.5 shrink-0 ${tone}`} />
      <span className="text-ink-dim">{point.text}</span>
    </li>
  );
}

function ZoneDetails({ zone, ctx, onClose, onRemove }) {
  const { result, world } = ctx;
  const finding = result?.findings.find((entry) => entry.id === zone.id) ?? null;
  const type = ZONE_TYPES[zone.type];
  const inside = finding?.inside ?? [];
  const look =
    finding?.settled === "violation"
      ? { Icon: AlertTriangle, bg: "bg-violation-dim", text: "text-violation", title: zone.type === "walkway" ? "Blocked" : "Breached" }
      : finding?.settled === "watching"
        ? { Icon: Clock, bg: "bg-hazard-dim", text: "text-hazard", title: `Checking ${finding.votes.accusing} of ${finding.votes.needed}` }
        : { Icon: Check, bg: "bg-clear-dim", text: "text-clear", title: "Clear" };

  return (
    <aside className="panel flex flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          Selected: <span className="text-vision">{zone.name}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-faint hover:bg-panel-raised hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 text-base font-semibold text-ink">{zone.name}{zone.subtitle ? ` · ${zone.subtitle}` : ""}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">{type?.watches}</p>

      <h3 className="mt-4 text-xs font-semibold text-ink">Current Verdict</h3>
      <div className="mt-1.5 flex items-start gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${look.bg}`}>
          <look.Icon size={14} className={look.text} />
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${look.text}`}>{look.title}</div>
          <div className="text-[11px] leading-snug text-ink-dim">{finding?.because ?? "Not judged this frame."}</div>
        </div>
      </div>

      <h3 className="mt-4 text-xs font-semibold text-ink">Inside now</h3>
      <ul className="mt-1.5 space-y-1 text-xs">
        {inside.length === 0 && <li className="text-ink-faint">nothing it watches for</li>}
        {inside.map((entry) => (
          <Row key={entry.id} label={entry.name ?? entry.id} value={entry.score.toFixed(2)} />
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold text-ink">Shape</h3>
      <ul className="mt-1.5 space-y-1 text-xs">
        <Row label="Corners" value={String(zone.points.length)} />
        <Row label="Things on the floor" value={String(world.things.length)} />
      </ul>

      <button
        type="button"
        onClick={() => onRemove(zone.id)}
        className="mt-4 inline-flex items-center gap-1.5 self-start text-[11px] text-ink-faint transition-colors hover:text-violation"
      >
        <Trash2 size={11} />
        Remove area
      </button>
    </aside>
  );
}

function Portrait({ thing }) {
  return (
    <div className="h-[104px] w-[104px] shrink-0 overflow-hidden rounded-lg border border-line" style={{ background: "#3F434B" }}>
      <svg viewBox="-42 -42 84 84" className="h-full w-full">
        <rect x="-42" y="-42" width="84" height="84" fill="#474B53" />
        <line x1="-42" y1="20" x2="42" y2="20" stroke="#3A3E46" strokeWidth="1" />
        <ThingArt thing={thing} />
      </svg>
    </div>
  );
}

function Row({ dot, label, value, action }) {
  return (
    <li className="flex items-center gap-2">
      {dot}
      <span className="min-w-0 flex-1 truncate text-ink-dim">{label}</span>
      <span className="machine shrink-0 text-ink">{value}</span>
      {action}
    </li>
  );
}

function dotFor(state) {
  const cls =
    state === "ok" ? "bg-clear" : state === "bad" ? "bg-violation" : state === "warn" ? "bg-hazard" : "bg-ink-faint";
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}
