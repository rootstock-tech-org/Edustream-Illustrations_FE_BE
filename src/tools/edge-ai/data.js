/**
 * data.js (Edge AI tool)
 * ----------------------
 * Researched content for the Edge-vs-Cloud inference tool: where AI inference
 * runs (on-device edge, cloud datacenter, or a hybrid split), the hardware,
 * model optimisation, a recommender and a live cost model.
 * Sources: Wikipedia Edge computing (edge AI / on-device AI) and Neural
 * processing unit / AI accelerator (NPU, TPU, Coral, Jetson, INT8, TOPS).
 */

/** Nodes in the inference pipeline. `pos` is a 3D marker position. */
export const NODES = [
  { id: 'camera', role: 'source', name: 'Smart Camera', pos: [-4, 0.6, 0], detail: 'The data source. It captures video frames that need AI inference (e.g. object detection). Raw frames are large, so where you run the model decides how much data must leave the device.' },
  { id: 'edge', role: 'edge', name: 'Edge Device', pos: [0, 0.6, 0], detail: 'An on-device AI accelerator (NPU) near the source, e.g. NVIDIA Jetson or Google Coral. Running inference here gives the lowest latency, keeps data local (privacy) and works offline, but compute and model size are limited.' },
  { id: 'cloud', role: 'cloud', name: 'Cloud Datacenter', pos: [4, 0.95, 0], detail: 'A datacenter with powerful accelerators (NVIDIA H100 GPUs, Google TPUs, AWS Inferentia). It can run the largest, most accurate models and is easy to update, but every request pays a network round-trip and raw data must leave the device.' },
];

/** Where inference runs. Controlled by the tool; drives the 3D pipeline. */
export const PLACEMENTS = [
  { id: 'edge', name: 'Edge', tag: 'On-device', detail: 'Inference runs on the device itself. Only a tiny result (labels / boxes) ever leaves. Lowest latency, best privacy, works without a network, but limited by the device\'s compute.' },
  { id: 'cloud', name: 'Cloud', tag: 'Datacenter', detail: 'Raw frames are streamed to the cloud, inferred on powerful hardware, and the result is sent back. Highest accuracy and easiest to update, but adds a network round-trip and heavy bandwidth.' },
  { id: 'hybrid', name: 'Hybrid', tag: 'Split', detail: 'The edge pre-processes and compresses each frame into compact features, sends those to the cloud for the heavy model, and gets the result back. A balance of latency, bandwidth and privacy.' },
];

/** Model sizes: bigger = more accurate but heavier, especially on the edge. */
export const MODELS = [
  { id: 'small', name: 'Small', sub: 'MobileNet-class', accuracy: 82, edgeMs: 9, cloudMs: 3, sizeMB: 5 },
  { id: 'base', name: 'Base', sub: 'ResNet-class', accuracy: 90, edgeMs: 28, cloudMs: 6, sizeMB: 25 },
  { id: 'large', name: 'Large', sub: 'Transformer-class', accuracy: 96, edgeMs: 85, cloudMs: 12, sizeMB: 350 },
];

// Payload per frame (KB): raw frames are huge, features are compact, a result is tiny.
const RAW_KB = 300;
const FEATURE_KB = 24;
const RESULT_KB = 1;

/** Live inference cost for the current controls (per request + per second). */
export function computeInference({ placement, modelId, network, fps }) {
  const m = MODELS.find((x) => x.id === modelId) ?? MODELS[0];
  const bw = 2 + network * 3.8; // link bandwidth, Mbps
  const baseRtt = 70 - network * 6; // network base round-trip, ms
  const ms = (kb) => (kb * 8) / bw; // transfer time for a payload, ms (1 Mbps = 1 kbit/ms)

  let latency;
  let payloadKb;
  let privacy;
  if (placement === 'edge') {
    latency = m.edgeMs;
    payloadKb = RESULT_KB;
    privacy = 'High';
  } else if (placement === 'cloud') {
    latency = baseRtt + ms(RAW_KB) + m.cloudMs + ms(RESULT_KB);
    payloadKb = RAW_KB;
    privacy = 'Low';
  } else {
    latency = m.edgeMs * 0.6 + baseRtt + ms(FEATURE_KB) + m.cloudMs + ms(RESULT_KB);
    payloadKb = FEATURE_KB;
    privacy = 'Medium';
  }

  return {
    latency: Math.round(latency),
    bandwidth: Math.round(((payloadKb * 8 * fps) / 1000) * 10) / 10, // Mbps sustained
    accuracy: m.accuracy,
    privacy,
    payloadKb,
  };
}

/** How much data flows edge -> cloud for the 3D scene (0..1 load). */
export const PLACEMENT_LOAD = { edge: 0.12, cloud: 1, hybrid: 0.4 };

/** AI accelerators, split by where they live. */
export const HARDWARE = [
  { id: 'coral', name: 'Google Coral (Edge TPU)', where: 'edge', detail: 'A small USB/M.2 accelerator running quantised INT8 models very efficiently for vision at the edge.' },
  { id: 'jetson', name: 'NVIDIA Jetson', where: 'edge', detail: 'A compact GPU module for robotics and cameras; runs real CNNs on-device with modest power.' },
  { id: 'npu', name: 'Phone / SoC NPU', where: 'edge', detail: 'Neural engines in Apple, Qualcomm and Google chips run small models at low power using INT8 / FP16 (measured in TOPS).' },
  { id: 'h100', name: 'NVIDIA H100 GPU', where: 'cloud', detail: 'A datacenter GPU with tensor cores for the biggest models; used for both training and high-throughput inference.' },
  { id: 'tpu', name: 'Google Cloud TPU', where: 'cloud', detail: 'A custom ASIC for large-scale matrix maths in Google Cloud, built for heavy training and inference.' },
  { id: 'inferentia', name: 'AWS Inferentia', where: 'cloud', detail: 'An AWS chip purpose-built for cost-efficient cloud inference at scale.' },
];

/** Optimisations that make a model small/fast enough for the edge. */
export const OPTIMIZATIONS = [
  { id: 'quant', name: 'Quantization', detail: 'Store weights and maths in INT8 instead of FP32. Roughly 4x smaller and faster on NPUs, with a small accuracy drop.' },
  { id: 'prune', name: 'Pruning', detail: 'Remove weights and channels that barely contribute, shrinking the network with little loss of accuracy.' },
  { id: 'distill', name: 'Knowledge distillation', detail: 'Train a small "student" model to imitate a large "teacher", packing most of the accuracy into far fewer parameters.' },
];

/** Recommender: what you need -> Edge / Cloud / Hybrid. */
export const RECO_REQUIREMENTS = [
  { id: 'latency', label: 'Low latency' },
  { id: 'offline', label: 'Works offline' },
  { id: 'privacy', label: 'Data privacy' },
  { id: 'accuracy', label: 'Max accuracy' },
  { id: 'thin', label: 'Cheap endpoint' },
  { id: 'update', label: 'Easy updates' },
];
export const RECO_CANDIDATES = [
  { id: 'edge', name: 'Edge', note: 'Run the model on the device: instant response, private, works with no network. Limited to smaller models.', fits: ['latency', 'offline', 'privacy'] },
  { id: 'cloud', name: 'Cloud', note: 'Send data to the datacenter: biggest, most accurate models and easy updates. Needs connectivity and more bandwidth.', fits: ['accuracy', 'thin', 'update'] },
  { id: 'hybrid', name: 'Hybrid', note: 'Edge filters, cloud does the heavy lifting: a balance of speed, privacy and accuracy.', fits: ['latency', 'privacy', 'accuracy', 'update'] },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'Why does running inference on the edge usually give lower latency than the cloud?',
    options: [
      { id: 'a', label: 'Edge devices always have faster processors' },
      { id: 'b', label: 'It avoids the network round-trip to a datacenter' },
      { id: 'c', label: 'The cloud uses slower models' },
    ],
    answerId: 'b',
    explanation: 'Inference happens next to the data, so there is no network round-trip; the cloud is often faster per-inference but pays for the trip.',
  },
  {
    id: 'q2',
    prompt: 'Which technique lets a large, accurate model run on a constrained edge NPU?',
    options: [
      { id: 'a', label: 'Quantization to INT8' },
      { id: 'b', label: 'Increasing the image resolution' },
      { id: 'c', label: 'Adding more layers' },
    ],
    answerId: 'a',
    explanation: 'Quantizing weights to INT8 makes a model ~4x smaller and faster on NPUs with only a small accuracy loss.',
  },
  {
    id: 'q3',
    prompt: 'A key privacy advantage of edge inference is that:',
    options: [
      { id: 'a', label: 'Raw data stays on the device; only results leave' },
      { id: 'b', label: 'Data is encrypted only in the cloud' },
      { id: 'c', label: 'It sends everything to the datacenter first' },
    ],
    answerId: 'a',
    explanation: 'Processing locally means sensitive raw data (video, audio) need not be transmitted; only compact results leave the device.',
  },
];

/** TinyML Advisor: model-shrinking optimisations (multiplicative size factors). */
export const TINYML_OPTS = [
  { id: 'quant', name: 'Quantization (INT8)', factor: 0.25, accDrop: 1, note: 'FP32 to INT8: about 4x smaller and faster on NPUs.' },
  { id: 'prune', name: 'Pruning', factor: 0.55, accDrop: 2, note: 'Remove low-value weights and channels.' },
  { id: 'distill', name: 'Distillation', factor: 0.4, accDrop: 3, note: 'A small student model mimics a large teacher.' },
];

/** Typical model-size budget that fits a Coral / Jetson-class edge NPU (MB). */
export const EDGE_BUDGET_MB = 8;

/** Apply the chosen optimisations to a base model, returning size, accuracy and fit. */
export function shrinkModel(baseMB, baseAcc, optIds) {
  let mb = baseMB;
  let acc = baseAcc;
  for (const id of optIds) {
    const o = TINYML_OPTS.find((x) => x.id === id);
    if (!o) continue;
    mb *= o.factor;
    acc -= o.accDrop;
  }
  return { mb: Math.max(0.1, mb), acc: Math.max(50, Math.round(acc)), fits: mb <= EDGE_BUDGET_MB };
}

/**
 * Cost Estimator (illustrative monthly USD). Edge pays mostly for on-device
 * accelerators; cloud pays per-inference compute plus raw-frame egress; hybrid
 * sends compact features so its egress is far smaller. Teaching estimates.
 */
export function computeCost({ placement, devices, fps }) {
  const inferPerMo = devices * fps * 3600 * 24 * 30; // inferences per month
  const rawGB = (devices * fps * RAW_KB_EXPORT * 3600 * 24 * 30) / 1e6 / 1024;
  const featGB = rawGB * (24 / 300);
  const per1k = 0.35; // cloud inference $ per 1000 calls
  const egress = 0.09; // $ per GB egress
  let items;
  if (placement === 'edge') {
    items = [
      { label: 'Edge accelerators', amount: devices * 4 },
      { label: 'Cloud (results only)', amount: 1 },
    ];
  } else if (placement === 'cloud') {
    items = [
      { label: 'Cloud inference', amount: (inferPerMo / 1000) * per1k },
      { label: 'Raw-frame egress', amount: rawGB * egress },
    ];
  } else {
    items = [
      { label: 'Edge accelerators', amount: devices * 3 },
      { label: 'Cloud inference', amount: (inferPerMo / 1000) * per1k },
      { label: 'Feature egress', amount: featGB * egress },
    ];
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  return { items: items.map((i) => ({ ...i, amount: Math.round(i.amount) })), total: Math.round(total), inferPerMo };
}

// Raw frame size (KB) exported for the cost model (mirrors the pipeline payload).
export const RAW_KB_EXPORT = 300;

/** Data Flow Explorer: what actually travels the link for each placement. */
export const FLOW_BY_PLACEMENT = {
  edge: { label: 'Edge', leaves: 'Only tiny results (labels/boxes) leave the device.', size: 'result', kb: 1, hue: '#a78bfa' },
  cloud: { label: 'Cloud', leaves: 'Every raw frame is streamed to the datacenter.', size: 'raw frame', kb: 300, hue: '#f472b6' },
  hybrid: { label: 'Hybrid', leaves: 'Compact features are sent; the cloud runs the heavy model.', size: 'features', kb: 24, hue: '#22d3ee' },
};
