// The Human-Robot Collaboration (HRC) topic backbone. Every article is tagged to
// one of these modules by its keywords. Modules are grouped so that closely
// related subtopics (whose keywords overlap in real stories) live together, which
// keeps an article's keyword hits in one bucket and improves relevance scoring.

export type Module = {
  id: string;
  name: string;
  keywords: string[];
};

export const MODULES: Module[] = [
  {
    id: "cobots",
    name: "Collaborative Robots (Cobots)",
    keywords: [
      "cobot", "cobots", "collaborative robot", "collaborative robotics", "collaborative arm",
      "Universal Robots", "UR5", "UR10", "UR20", "UR16", "force-limited", "power and force limiting",
      "hand guiding", "hand-guiding", "FANUC CRX", "Doosan Robotics", "Techman Robot", "Omron cobot",
      "payload cobot", "collaborative payload", "cobot deployment", "cobot arm", "lightweight robot arm",
      "collaborative application", "easy programming robot", "no-code robot",
    ],
  },
  {
    id: "hri-safety",
    name: "Human-Robot Interaction & Safety",
    keywords: [
      "human-robot interaction", "human robot interaction", "HRI", "human-robot collaboration",
      "human robot collaboration", "ISO 10218", "ISO/TS 15066", "ISO 15066", "speed and separation monitoring",
      "safety-rated monitored stop", "collision detection", "collision avoidance", "safety scanner",
      "safety laser scanner", "risk assessment", "shared workspace", "safe robot", "functional safety",
      "safety controller", "safety PLC", "force and pressure limits", "biomechanical limits",
      "protective stop", "safe motion", "robot safety standard", "coexistence", "cooperation",
      "trust in automation", "ergonomics", "human-in-the-loop", "human robot teaming",
    ],
  },
  {
    id: "industrial",
    name: "Industrial Robotics & Automation",
    keywords: [
      "industrial robot", "robotic arm", "six-axis robot", "6-axis robot", "articulated robot",
      "SCARA", "delta robot", "palletizing", "palletizer", "welding robot", "arc welding robot",
      "spot welding", "pick and place", "material handling", "machine tending", "factory automation",
      "manufacturing automation", "ABB Robotics", "KUKA", "Yaskawa", "Motoman", "Kawasaki Robotics",
      "Stäubli", "robot integrator", "system integrator", "production line", "assembly line",
      "robotic cell", "work cell", "robot deployment", "automation solution", "robotic automation",
    ],
  },
  {
    id: "humanoid",
    name: "Humanoid Robots",
    keywords: [
      "humanoid robot", "humanoid", "Tesla Optimus", "Optimus robot", "Figure 01", "Figure 02",
      "Figure AI", "Agility Robotics", "Agility Digit", "Digit robot", "Boston Dynamics Atlas",
      "Atlas robot", "Apptronik", "Apollo robot", "Unitree", "Unitree G1", "1X Technologies", "Neo robot",
      "Sanctuary AI", "bipedal robot", "legged robot", "general-purpose robot", "general purpose humanoid",
      "humanoid startup", "walking robot", "android robot",
    ],
  },
  {
    id: "mobile-field",
    name: "Mobile Robots, AMR & Drones",
    keywords: [
      "AMR", "autonomous mobile robot", "AGV", "automated guided vehicle", "warehouse robot",
      "warehouse automation", "mobile manipulator", "mobile robot", "SLAM", "robot navigation",
      "autonomous navigation", "logistics robot", "fulfillment robot", "goods-to-person",
      "last-mile robot", "delivery robot", "sidewalk robot", "quadruped", "robot dog", "Spot robot",
      "drone", "UAV", "unmanned aerial vehicle", "quadcopter", "BVLOS", "drone delivery",
      "aerial robotics", "autonomous drone", "inspection drone",
    ],
  },
  {
    id: "ai-perception",
    name: "AI, Perception & Manipulation",
    keywords: [
      "robot learning", "reinforcement learning", "imitation learning", "robot perception",
      "computer vision", "machine vision", "robot foundation model", "foundation model for robotics",
      "vision-language-action", "VLA model", "RT-2", "RT-X", "embodied AI", "embodied intelligence",
      "robot policy", "robot manipulation", "dexterous manipulation", "gripper", "end effector",
      "robotic hand", "robot hand", "tactile sensing", "tactile sensor", "grasping", "grasp planning",
      "soft robotics", "soft gripper", "force sensor", "force torque sensor", "3D vision", "bin picking",
      "teleoperation", "learning from demonstration", "sim-to-real transfer",
    ],
  },
  {
    id: "digital-twin",
    name: "Digital Twins & Simulation",
    keywords: [
      "digital twin", "robot simulation", "simulation platform", "NVIDIA Omniverse", "Omniverse",
      "NVIDIA Isaac", "Isaac Sim", "Isaac Lab", "sim-to-real", "virtual commissioning", "Gazebo",
      "MuJoCo", "robot digital twin", "synthetic data", "synthetic data generation", "physics simulation",
      "virtual factory", "process simulation", "offline programming", "robot programming simulation",
      "world model", "3D simulation",
    ],
  },
  {
    id: "industry-research",
    name: "Industry, Market & Research",
    keywords: [
      "robotics funding", "robotics startup", "robotics investment", "robotics market",
      "robot installations", "robotics acquisition", "robotics merger", "robot adoption",
      "automation investment", "IFR", "International Federation of Robotics",
      "A3 robotics", "Association for Advancing Automation", "robot density", "robotics report",
      "robotics research", "ROS", "ROS 2", "Robot Operating System", "robotics benchmark",
      "robotics dataset", "IEEE robotics", "ICRA", "IROS", "open-source robot", "research lab robot",
      "robotics paper", "academic robotics",
    ],
  },
];
