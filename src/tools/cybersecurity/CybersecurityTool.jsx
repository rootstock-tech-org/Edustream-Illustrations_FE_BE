/**
 * CybersecurityTool.jsx
 * ---------------------
 * Full-screen OT security tool: toggle layered defences, pick an attack and
 * launch it. Watch the attack packet drive through the Purdue zones and get
 * stopped at the first effective defence, or breach the process.
 */
import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, ShieldAlert, Swords } from 'lucide-react';
import NetworkDefenseScene from './NetworkDefenseScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { ZONES, DEFENSES, ATTACKS, simulateAttack, postureScore, KNOWLEDGE_QUESTIONS } from './data';
import { PurdueLevels, ZonesConduits, SecurityLevels, Threats } from './Widgets';

const TABS = ['Zones', 'Purdue', 'Security Levels', 'Threats'];

function WidgetPanel() {
  const [tab, setTab] = useState('Zones');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-teal-500/15 text-teal-400 light:text-teal-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Zones' && <ZonesConduits />}
        {tab === 'Purdue' && <PurdueLevels />}
        {tab === 'Security Levels' && <SecurityLevels />}
        {tab === 'Threats' && <Threats />}
      </div>
    </div>
  );
}

export default function CybersecurityTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [defenseOn, setDefenseOn] = useState({ firewall: true, dmz: true, segmentation: true, ids: false, hardening: false });
  const [attackId, setAttackId] = useState('targeted');
  const [launchKey, setLaunchKey] = useState(0);
  const [selectedId, setSelectedId] = useState('control');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const sim = simulateAttack(attackId, defenseOn);
  const posture = postureScore(defenseOn);
  const attack = ATTACKS.find((a) => a.id === attackId);
  const reachedZone = ZONES.find((z) => z.id === sim.reached);
  const stoppedByDef = DEFENSES.find((d) => d.id === sim.stoppedBy);
  const bypassedDefs = (sim.bypassed ?? []).map((id) => DEFENSES.find((d) => d.id === id)).filter(Boolean);
  const activeCount = DEFENSES.filter((d) => defenseOn[d.id]).length;

  // Resolve whatever is selected in the scene (a zone, a defence shield, or the attacker).
  const selInfo = (() => {
    if (typeof selectedId === 'string' && selectedId.startsWith('wall:')) {
      const d = DEFENSES.find((x) => x.id === selectedId.slice(5));
      if (d) return { tag: `Defence · SL ${d.level} · ${defenseOn[d.id] ? 'active' : 'off'}`, title: d.name, detail: d.detail };
    }
    if (selectedId === 'attacker') return { tag: `Attacker · SL ${attack.sl}`, title: attack.name, detail: attack.detail };
    const z = ZONES.find((x) => x.id === selectedId);
    if (z) return { tag: `Zone · ${z.level}`, title: z.name, detail: `${z.level} zone. Traffic in or out must cross a controlled conduit, so a breach in one zone is contained.` };
    return { tag: 'Select', title: 'Tap any element', detail: 'Click a zone, a defence shield or the attacker to inspect it.' };
  })();

  // Re-run the attack animation whenever the configuration changes.
  useEffect(() => { setLaunchKey((k) => k + 1); }, [attackId, defenseOn]);

  const toggle = (id) => setDefenseOn((d) => ({ ...d, [id]: !d[id] }));

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [0, 4.5, 11], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <NetworkDefenseScene defenseOn={defenseOn} reached={sim.reached} breached={sim.breached} launchKey={launchKey} selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Defend the plant · tap a zone, shield or attacker</span>
      </div>

      <ModelOverview
        accent="teal"
        title="Defend the Factory Network"
        points={[
          'The zones run from enterprise IT (left) to the process/PLC (right), the Purdue model of an OT network.',
          'Toggle defence layers; each guards one boundary and stops attacks up to its Security Level.',
          'Launch an attack and watch the red packet get blocked (turns green) or breach the process. More layers = defence in depth.',
        ]}
      />

      {/* Left: defences + attack */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Defence layers</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2 border-b border-slate-800 p-3">
            {DEFENSES.map((d) => (
              <button key={d.id} onClick={() => toggle(d.id)} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold ${defenseOn[d.id] ? 'border-teal-400/60 bg-teal-500/20 text-white light:bg-teal-400 light:text-slate-900 light:border-teal-500' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                <span>{d.name}</span>
                <span className={`h-2 w-2 rounded-full ${defenseOn[d.id] ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              </button>
            ))}
            <div className="pt-1">
              <span className="mb-1 block text-[11px] text-slate-400">Attack</span>
              <div className="grid grid-cols-2 gap-1">
                {ATTACKS.map((a) => (
                  <button key={a.id} onClick={() => setAttackId(a.id)} className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${attackId === a.id ? 'border-rose-400/60 bg-rose-500/20 text-white light:bg-rose-400 light:text-slate-900 light:border-rose-500' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>{a.name}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setLaunchKey((k) => k + 1)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500">
              <Swords className="h-3.5 w-3.5" /> Launch attack
            </button>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: status */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-teal-300 light:text-teal-700"><ShieldAlert className="h-3.5 w-3.5" /> Security posture</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>

          <div className={`rounded-lg border p-2.5 ${sim.breached ? 'border-rose-500/50 bg-rose-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
            <p className="text-[10px] text-slate-400">Result</p>
            <p className={`text-xl font-bold ${sim.breached ? 'text-rose-300' : 'text-emerald-300'}`}>{sim.breached ? 'BREACHED' : 'Secured'}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {sim.breached ? `${attack.name} reached the process.` : `${attack.name} stopped at ${reachedZone?.name} by ${stoppedByDef?.name}.`}
            </p>
            {bypassedDefs.length > 0 && (
              <p className="mt-1.5 border-t border-slate-700/60 pt-1.5 text-[11px] text-amber-300 light:text-amber-700">
                {bypassedDefs.map((d) => d.name).join(', ')} {bypassedDefs.length > 1 ? 'were' : 'was'} on but too weak: SL {Math.max(...bypassedDefs.map((d) => d.level))} cannot stop an SL {attack.sl} attack.
              </p>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Defence depth</p>
              <p className={`text-lg font-bold tabular-nums ${posture >= 80 ? 'text-emerald-300' : posture >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>{posture}<span className="ml-0.5 text-[10px] font-normal text-slate-500">%</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Attack SL</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{attack.sl}</p>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-teal-300 light:text-teal-700">OT vs IT</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">In OT security the priority flips to <span className="text-slate-200">Availability first</span> (keep the plant running safely), then Integrity, then Confidentiality: the reverse of IT's C-I-A.</p>
          </div>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-teal-300 light:text-teal-700">{selInfo.tag}</p>
            <p className="text-sm font-bold text-slate-100">{selInfo.title}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selInfo.detail}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="teal" />
    </div>
  );
}
