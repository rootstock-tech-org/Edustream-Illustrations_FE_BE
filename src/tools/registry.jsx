/**
 * registry.jsx
 * ------------
 * Maps a module slug to its full-screen tool component. Modules whose tool isn't
 * built yet fall back to ComingSoonTool.
 */
import FoundationsTool from './foundations/FoundationsTool';
import SensorsTool from './sensors/SensorsTool';
import CommunicationTool from './communication/CommunicationTool';
import EdgeAiTool from './edge-ai/EdgeAiTool';
import PlcScadaTool from './plc-scada/PlcScadaTool';
import PredictiveMaintenanceTool from './predictive-maintenance/PredictiveMaintenanceTool';
import CybersecurityTool from './cybersecurity/CybersecurityTool';
import RoboticsTool from './robotics/RoboticsTool';
import DigitalTwinTool from './digital-twin/DigitalTwinTool';
import CapstoneTool from './capstone/CapstoneTool';
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
