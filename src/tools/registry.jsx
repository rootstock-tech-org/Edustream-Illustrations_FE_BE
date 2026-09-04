/**
 * registry.jsx
 * ------------
 * Maps a module slug to its full-screen tool component. Modules whose tool isn't
 * built yet fall back to ComingSoonTool.
 */
import FoundationsTool from './foundations/FoundationsTwin';
import SensorsTool from './sensors/SensorsTwin';
import CommunicationTool from './communication/CommunicationTwin';
import EdgeAiTool from './edge-ai/EdgeAiTwin';
import PlcScadaTool from './plc-scada/PlcScadaTwin';
import PredictiveMaintenanceTool from './predictive-maintenance/PredictiveMaintenanceTwin';
import CybersecurityTool from './cybersecurity/CybersecurityTwin';
import RoboticsTool from './robotics/RoboticsTwin';
import DigitalTwinTool from './digital-twin/DigitalTwinTwin';
import CapstoneTool from './capstone/CapstoneTwin';
import ComingSoonTool from '../components/ComingSoonTool';

const TOOLS = {
  foundations: FoundationsTool,
  sensors: SensorsTool,
  communication: CommunicationTool,
  'edge-ai': EdgeAiTool,
  'plc-scada': PlcScadaTool,
  'predictive-maintenance': PredictiveMaintenanceTool,
  cybersecurity: CybersecurityTool,
  robotics: RoboticsTool,
  'digital-twin': DigitalTwinTool,
  capstone: CapstoneTool,
};

export function getTool(slug) {
  return TOOLS[slug] ?? null;
}

export { ComingSoonTool };
