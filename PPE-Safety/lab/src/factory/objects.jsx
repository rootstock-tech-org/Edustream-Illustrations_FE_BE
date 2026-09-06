import { KINDS } from "../engine/world.js";

/**
 * What each thing on the floor looks like, as a ceiling camera would see it:
 * a high-angle view, the way the reference floor is shot, so a person reads
 * as a helmet, shoulders in a hi-vis vest and legs below, rather than as an
 * abstract plan symbol.
 *
 * Every shape is drawn around the origin and is placed by its parent, so a
 * thing's position is one number in the world and never baked into its art.
 * The origin is the point the zone rules judge — roughly where the feet are.
 *
 * Nothing here is a verdict: what a worker is *wearing* is ground truth the
 * viewer set and is drawn as such; what the system *believes* about it is
 * the detection box and label the canvas draws from the engine's findings.
 */

const SKIN = "#D9A57B";
const HAIR = "#3B2A1A";
const HELMET = "#F5C518";
const HELMET_DARK = "#C79A0B";
const VEST = "#D7E534";
const VEST_DARK = "#9AA61A";
const STRIPE = "#C8CDD3";
const SHIRT = "#4B5A6B";
const TROUSERS = "#243247";
const BOOT = "#151B26";
const SHADOW = "rgba(0,0,0,0.45)";

function Worker({ wearing }) {
  const helmet = wearing.includes("helmet");
  const vest = wearing.includes("vest");
  const gloves = wearing.includes("gloves");

  return (
    <g>
      <ellipse cx="0" cy="24" rx="16" ry="6" fill={SHADOW} />
      {/* legs */}
      <rect x="-9" y="8" width="7" height="16" rx="3" fill={TROUSERS} />
      <rect x="2" y="8" width="7" height="16" rx="3" fill={TROUSERS} />
      <rect x="-10" y="20" width="9" height="5" rx="2" fill={BOOT} />
      <rect x="1" y="20" width="9" height="5" rx="2" fill={BOOT} />
      {/* arms */}
      <rect x="-18" y="-6" width="7" height="18" rx="3.5" fill={vest ? SHIRT : SHIRT} />
      <rect x="11" y="-6" width="7" height="18" rx="3.5" fill={SHIRT} />
      <circle cx="-14.5" cy="12" r="3.2" fill={gloves ? "#E8890C" : SKIN} />
      <circle cx="14.5" cy="12" r="3.2" fill={gloves ? "#E8890C" : SKIN} />
      {/* torso */}
      <rect x="-13" y="-9" width="26" height="21" rx="6" fill={vest ? VEST : SHIRT} stroke={vest ? VEST_DARK : "#33404F"} strokeWidth="1" />
      {vest && (
        <>
          <rect x="-13" y="-1" width="26" height="3" fill={STRIPE} opacity="0.9" />
          <rect x="-13" y="5" width="26" height="3" fill={STRIPE} opacity="0.9" />
          <line x1="-6" y1="-9" x2="-6" y2="12" stroke={STRIPE} strokeWidth="2" opacity="0.8" />
          <line x1="6" y1="-9" x2="6" y2="12" stroke={STRIPE} strokeWidth="2" opacity="0.8" />
        </>
      )}
      {/* head */}
      <circle cx="0" cy="-15" r="7.5" fill={SKIN} />
      {helmet ? (
        <>
          <ellipse cx="0" cy="-17" rx="10.5" ry="8.5" fill={HELMET} stroke={HELMET_DARK} strokeWidth="1" />
          <ellipse cx="0" cy="-12.5" rx="11.5" ry="2.6" fill={HELMET_DARK} opacity="0.9" />
          <path d="M-4 -23 Q0 -25 4 -23" stroke="#FFF3B0" strokeWidth="1.5" fill="none" opacity="0.8" />
        </>
      ) : (
        <ellipse cx="0" cy="-18" rx="7.5" ry="5.5" fill={HAIR} />
      )}
    </g>
  );
}

function Forklift() {
  return (
    <g>
      <ellipse cx="4" cy="20" rx="40" ry="7" fill={SHADOW} />
      {/* wheels */}
      <rect x="-30" y="-22" width="12" height="8" rx="2" fill="#111827" />
      <rect x="-30" y="14" width="12" height="8" rx="2" fill="#111827" />
      <rect x="10" y="-22" width="12" height="8" rx="2" fill="#111827" />
      <rect x="10" y="14" width="12" height="8" rx="2" fill="#111827" />
      {/* body */}
      <rect x="-32" y="-16" width="58" height="32" rx="4" fill="#E4711B" stroke="#8C3F0C" strokeWidth="1.2" />
      <rect x="-30" y="-13" width="18" height="26" rx="2" fill="#C85F14" />
      {/* counterweight stripes */}
      <path d="M-30 -6 h6 M-30 0 h6 M-30 6 h6" stroke="#8C3F0C" strokeWidth="1.5" />
      {/* overhead guard */}
      <rect x="-12" y="-14" width="26" height="28" rx="2" fill="none" stroke="#2B2F36" strokeWidth="3" />
      <line x1="-12" y1="0" x2="14" y2="0" stroke="#2B2F36" strokeWidth="2" />
      {/* seat + operator */}
      <rect x="-8" y="-9" width="10" height="18" rx="3" fill="#1F2937" />
      <circle cx="3" cy="0" r="5" fill={HELMET} stroke={HELMET_DARK} strokeWidth="1" />
      {/* mast */}
      <rect x="26" y="-18" width="6" height="36" rx="1" fill="#1F2937" />
      {/* forks */}
      <rect x="32" y="-11" width="30" height="4" rx="1" fill="#9AA3AE" />
      <rect x="32" y="7" width="30" height="4" rx="1" fill="#9AA3AE" />
      {/* beacon */}
      <circle cx="-20" cy="-20" r="3" fill="#F59E0B" stroke="#7C2D12" strokeWidth="0.8" />
    </g>
  );
}

function Crate() {
  return (
    <g>
      <rect x="-19" y="-15" width="40" height="36" rx="2" fill={SHADOW} />
      <rect x="-20" y="-20" width="40" height="36" rx="1.5" fill="#9A6A3C" stroke="#5B3B1C" strokeWidth="1.2" />
      <path d="M-20 -8 h40 M-20 4 h40" stroke="#6E4824" strokeWidth="1.2" />
      <path d="M-20 -20 L20 16 M20 -20 L-20 16" stroke="#7A5128" strokeWidth="1" opacity="0.6" />
      <rect x="-20" y="16" width="40" height="4" fill="#6E4824" />
      <path d="M-14 16 v4 M0 16 v4 M14 16 v4" stroke="#4A3018" strokeWidth="1.5" />
    </g>
  );
}

function Workstation() {
  return (
    <g>
      <rect x="-34" y="-16" width="70" height="38" rx="2" fill={SHADOW} />
      <rect x="-36" y="-20" width="72" height="40" rx="2" fill="#5B6470" stroke="#2F353D" strokeWidth="1.2" />
      <rect x="-32" y="-16" width="64" height="32" rx="1" fill="#6B7583" />
      <rect x="-28" y="-12" width="20" height="14" rx="1" fill="#1E293B" stroke="#0F172A" strokeWidth="1" />
      <rect x="-27" y="-11" width="18" height="12" fill="#1D4ED8" opacity="0.55" />
      <rect x="0" y="-12" width="26" height="24" rx="1" fill="#4B5563" stroke="#2F353D" strokeWidth="1" />
      <circle cx="13" cy="0" r="6" fill="#374151" stroke="#1F2937" strokeWidth="1" />
      <circle cx="-4" cy="10" r="2" fill="#22C55E" />
    </g>
  );
}

/** A roller-shutter door in the top wall: down when closed, up when open. */
function Door({ open }) {
  return (
    <g>
      <rect x="-46" y="-14" width="92" height="30" fill="#0B0F17" />
      {open ? (
        <>
          <rect x="-46" y="-14" width="92" height="30" fill="#05070B" />
          <rect x="-46" y="-14" width="92" height="6" fill="#9AA3AE" stroke="#4B5563" strokeWidth="1" />
          <path d="M-40 -6 L-30 12 M-20 -6 L-10 12 M0 -6 L10 12 M20 -6 L30 12" stroke="#1F2937" strokeWidth="1" opacity="0.6" />
        </>
      ) : (
        <>
          <rect x="-46" y="-14" width="92" height="30" fill="#B8C0CA" stroke="#6B7280" strokeWidth="1" />
          {[-10, -6, -2, 2, 6, 10].map((y) => (
            <line key={y} x1="-46" y1={y} x2="46" y2={y} stroke="#7B8794" strokeWidth="1" />
          ))}
          <rect x="-8" y="2" width="16" height="6" rx="1" fill="#3B4552" />
        </>
      )}
      <rect x="-48" y="-16" width="4" height="34" fill="#F5C518" />
      <rect x="44" y="-16" width="4" height="34" fill="#F5C518" />
    </g>
  );
}

/** A wall-mounted CCTV camera, seen from above, pointing into the floor. */
function Camera() {
  return (
    <g transform="rotate(35)">
      <rect x="-20" y="-7" width="36" height="14" rx="4" fill="#CBD2DA" stroke="#5B6470" strokeWidth="1.2" />
      <rect x="10" y="-9" width="14" height="18" rx="3" fill="#8A939E" stroke="#4B5563" strokeWidth="1" />
      <circle cx="19" cy="0" r="4.5" fill="#0B1220" stroke="#22D3EE" strokeWidth="1.5" />
      <circle cx="19" cy="0" r="1.6" fill="#22D3EE" />
      <rect x="-26" y="-3" width="8" height="6" rx="1" fill="#5B6470" />
      <circle cx="-14" cy="-4" r="1.5" fill="#22C55E" />
    </g>
  );
}

/** The one place a kind maps to its art. */
export function ThingArt({ thing, dim = 1 }) {
  const art = () => {
    switch (thing.kind) {
      case KINDS.WORKER:
        return <Worker wearing={thing.wearing} />;
      case KINDS.FORKLIFT:
        return <Forklift />;
      case KINDS.CAMERA:
        return <Camera />;
      case KINDS.DOOR:
        return <Door open={thing.open} />;
      case KINDS.WORKSTATION:
        return <Workstation />;
      default:
        return <Crate />;
    }
  };

  return <g opacity={dim}>{art()}</g>;
}
