/*
 * Test manifest — every tool's model + spec + figure in one place so the §14.4
 * suites can iterate all 10 uniformly. Not shipped in the app bundle.
 */
import { SENSORS_SPEC } from '../sensors/spec.js';
import * as sensorsModel from '../sensors/model.js';
import SensorsFigure from '../sensors/SensorsFigure.jsx';

import { PM_SPEC } from '../predictive-maintenance/spec.js';
import * as pmModel from '../predictive-maintenance/model.js';
import PmFigure from '../predictive-maintenance/PmFigure.jsx';

import { COMM_SPEC } from '../communication/spec.js';
import * as commModel from '../communication/model.js';
import CommFigure from '../communication/CommFigure.jsx';

import { FOUND_SPEC } from '../foundations/spec.js';
import * as foundationsModel from '../foundations/model.js';
import FoundationsFigure from '../foundations/FoundationsFigure.jsx';

import { EDGE_SPEC } from '../edge-ai/spec.js';
import * as edgeModel from '../edge-ai/model.js';
import EdgeFigure from '../edge-ai/EdgeFigure.jsx';

import { DT_SPEC } from '../digital-twin/spec.js';
import * as dtModel from '../digital-twin/model.js';
import DtFigure from '../digital-twin/DtFigure.jsx';

import { ROBO_SPEC } from '../robotics/spec.js';
import * as roboModel from '../robotics/model.js';
import RoboFigure from '../robotics/RoboFigure.jsx';

import { CYBER_SPEC } from '../cybersecurity/spec.js';
import * as cyberModel from '../cybersecurity/model.js';
import CyberFigure from '../cybersecurity/CyberFigure.jsx';

import { CAPSTONE_SPEC } from '../capstone/spec.js';
import * as capstoneModel from '../capstone/model.js';
import CapstoneFigure from '../capstone/CapstoneFigure.jsx';

// plc-scada is a dynamic ladder-logic twin with its own solveLadder/step API
// (not the steady evaluate(params,faults) shape); it has a dedicated test file.
export const TOOLS = [
  { slug: 'sensors', spec: SENSORS_SPEC, evaluate: sensorsModel.evaluate, Figure: SensorsFigure },
  { slug: 'predictive-maintenance', spec: PM_SPEC, evaluate: pmModel.evaluate, Figure: PmFigure },
  { slug: 'communication', spec: COMM_SPEC, evaluate: commModel.evaluate, Figure: CommFigure },
  { slug: 'foundations', spec: FOUND_SPEC, evaluate: foundationsModel.evaluate, Figure: FoundationsFigure },
  { slug: 'edge-ai', spec: EDGE_SPEC, evaluate: edgeModel.evaluate, Figure: EdgeFigure },
  { slug: 'digital-twin', spec: DT_SPEC, evaluate: dtModel.evaluate, Figure: DtFigure },
  { slug: 'robotics', spec: ROBO_SPEC, evaluate: roboModel.evaluate, Figure: RoboFigure },
  { slug: 'cybersecurity', spec: CYBER_SPEC, evaluate: cyberModel.evaluate, Figure: CyberFigure },
  { slug: 'capstone', spec: CAPSTONE_SPEC, evaluate: capstoneModel.evaluate, Figure: CapstoneFigure },
];

// Nameplate parameter set for a spec (§4 parameters[].nameplate).
export function nameplate(spec) {
  return Object.fromEntries(spec.parameters.map((p) => [p.key, p.nameplate]));
}
