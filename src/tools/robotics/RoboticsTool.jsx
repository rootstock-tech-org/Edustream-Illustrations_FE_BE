/**
 * RoboticsTool.jsx
 * ----------------
 * Full-screen Robotics tool: drive a 6-axis articulated arm joint by joint (or
 * run a demo sweep) and read the live forward-kinematics tool position.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, Bot, RotateCcw, Play, Pause } from 'lucide-react';
import RobotCellScene from './RobotCellScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { JOINTS, HOME_POSE, LINK, forwardKinematics, getPoseAtProgress, getToolPointWorld, GRIP_CLOSE_T, RELEASE_T, PICK_POSE, PLACE_POSE, KNOWLEDGE_QUESTIONS } from './data';
import { RobotTypes, KinematicsExplorer, Applications, Safety } from './Widgets';

const TABS = ['Types', 'Kinematics', 'Applications', 'Safety'];
const deg = (r) => Math.round((r * 180) / Math.PI);

function WidgetPanel() {
  const [tab, setTab] = useState('Types');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-orange-500/15 text-orange-400 light:text-orange-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Types' && <RobotTypes />}
        {tab === 'Kinematics' && <KinematicsExplorer />}
        {tab === 'Applications' && <Applications />}
        {tab === 'Safety' && <Safety />}
      </div>
    </div>
  );
}

export default function RoboticsTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [pose, setPose] = useState({ ...HOME_POSE });
  const [selectedId, setSelectedId] = useState('elbow');
  const [demo, setDemo] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  // Manual grasp state: is the block currently gripped, and where it rests when not.
  const [held, setHeld] = useState(false);
  const [blockRest, setBlockRest] = useState(() => getToolPointWorld(PICK_POSE, LINK.WRIST_TO_GRASP));

  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [cycles, setCycles] = useState(0);
  useEffect(() => {
    if (!demo) return undefined;
    const id = setInterval(() => {
      const next = progressRef.current + 0.006;
      if (next >= 1) setCycles((c) => c + 1); // one full pick-and-place completed
      progressRef.current = next % 1;
      setProgress(progressRef.current);
      setPose(getPoseAtProgress(progressRef.current));
    }, 40);
    return () => clearInterval(id);
  }, [demo]);

  const set = (id, v) => { setDemo(false); setPose((p) => ({ ...p, [id]: v })); };
  const fk = forwardKinematics(pose);
  const selJoint = JOINTS.find((j) => j.id === selectedId) ?? JOINTS[0];

  // Pick/place stands and the handled block; the block follows the tool while gripped.
  const pickPos = useMemo(() => getToolPointWorld(PICK_POSE, LINK.WRIST_TO_GRASP), []);
  const placePos = useMemo(() => getToolPointWorld(PLACE_POSE, LINK.WRIST_TO_GRASP), []);

  // Manual grab/release: close the gripper near the block to pick it, open to drop it.
  useEffect(() => {
    if (demo) return; // the demo runs its own scripted pick-and-place
    const tp = getToolPointWorld(pose, LINK.WRIST_TO_GRASP);
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (!held && pose.gripper < 0.35 && d3(tp, blockRest) < 0.6) {
      setHeld(true);
    } else if (held && pose.gripper > 0.6) {
      // Released: the block always settles back onto the nearest table (Pick/Place stand).
      const d2 = (s) => Math.hypot(tp[0] - s[0], tp[2] - s[2]);
      setHeld(false);
      setBlockRest(d2(placePos) <= d2(pickPos) ? placePos : pickPos);
    }
  }, [pose, demo, held, blockRest, pickPos, placePos]);

  const demoCarry = demo && progress >= GRIP_CLOSE_T && progress <= RELEASE_T;
  const carrying = demoCarry || (!demo && held);
  const objectPos = demo
    ? (demoCarry ? getToolPointWorld(pose, LINK.WRIST_TO_GRASP) : progress > RELEASE_T ? placePos : pickPos)
    : (held ? getToolPointWorld(pose, LINK.WRIST_TO_GRASP) : blockRest);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [8.5, 6, 10], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <RobotCellScene pose={pose} objectPos={objectPos} carrying={carrying} pickPos={pickPos} placePos={placePos} showLabels={!demo} selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Drive the joints · tap a label</span>
      </div>

      <ModelOverview
        accent="orange"
        title="A 6-Axis Robot Arm"
        points={[
          'This is an articulated arm: six joints chained base to gripper, the most common industrial robot.',
          'Drive each joint with the sliders (J1 base to J6 gripper). Reach the blue block, CLOSE J6 to grab it, move the arm, then OPEN J6 to set it down on the nearest table.',
          'Or hit Demo for a scripted pick-and-place from the Pick stand to the Place stand; the panel shows the live tool X-Y-Z from forward kinematics.',
        ]}
      />

      {/* Left: joint controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Joint control</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2.5 border-b border-slate-800 p-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => { setDemo(false); progressRef.current = 0; setProgress(0); setCycles(0); setHeld(false); setBlockRest(pickPos); setPose({ ...HOME_POSE }); }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-400"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
              <button onClick={() => { progressRef.current = 0; setProgress(0); setHeld(false); setDemo((d) => !d); }} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold ${demo ? 'bg-orange-500 text-slate-950 hover:bg-orange-400' : 'border border-slate-600 text-slate-200 hover:border-slate-400'}`}>{demo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {demo ? 'Stop' : 'Demo'}</button>
            </div>
            {JOINTS.map((j) => (
              <label key={j.id} className="block" onClick={() => setSelectedId(j.id)}>
                <span className="mb-0.5 flex justify-between text-[11px] text-slate-400">
                  <span className={selectedId === j.id ? 'text-orange-300' : ''}>{j.label}</span>
                  <span className="tabular-nums text-slate-200">{j.id === 'gripper' ? `${Math.round(pose.gripper * 100)}%` : `${deg(pose[j.id])}°`}</span>
                </span>
                <input type="range" min={j.min} max={j.max} step={j.id === 'gripper' ? 0.01 : 0.01} value={pose[j.id]} onChange={(e) => set(j.id, Number(e.target.value))} className="w-full" style={{ accentColor: '#fb923c' }} />
              </label>
            ))}
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: kinematics readout */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-orange-300 light:text-orange-700"><Bot className="h-3.5 w-3.5" /> Tool position</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className={`mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${demo ? 'border-emerald-500/50 bg-emerald-500/10' : held ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-600/50 bg-slate-700/10'}`}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold">
              <span className={`h-2 w-2 rounded-full ${demo ? 'bg-emerald-400' : held ? 'bg-sky-400' : 'bg-slate-400'}`} />
              <span className={demo ? 'text-emerald-300 light:text-emerald-700' : held ? 'text-sky-300 light:text-sky-700' : 'text-slate-300 light:text-slate-600'}>{demo ? 'RUNNING' : held ? 'HOLDING PART' : 'MANUAL'}</span>
            </span>
            <span className="text-[11px] text-slate-400">{demo ? <>Cycles <span className="font-bold tabular-nums text-slate-100">{cycles}</span></> : <>Gripper <span className="font-bold tabular-nums text-slate-100">{Math.round(pose.gripper * 100)}%</span></>}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['X', fk.x], ['Y', fk.y], ['Z', fk.z]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-center">
                <p className="text-[10px] text-slate-400">{k}</p>
                <p className="text-base font-bold tabular-nums text-cyan-300">{v.toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Reach</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{fk.reach.toFixed(2)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">u</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">DOF</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">6</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Forward kinematics turns the six joint angles into this tool X-Y-Z, live.</p>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-orange-300 light:text-orange-700">{selJoint.axis}</p>
            <p className="text-sm font-bold text-slate-100">{selJoint.label}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selJoint.id === 'gripper' ? 'The end-of-arm tool (EOAT): here a two-finger gripper that opens and closes to grasp parts.' : `A rotary joint moving about the ${selJoint.axis.toLowerCase()} axis. Every joint downstream moves with it.`}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="orange" />
    </div>
  );
}
