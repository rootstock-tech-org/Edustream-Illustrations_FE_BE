import { create } from 'zustand';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { defaultValues, clampParameter } from '@/domain/parameters/parameter.schema';
import { getDevice, DEFAULT_DEVICE_ID } from '@/domain/devices/registry';

/**
 * Holds the user's INTENT: which device, and the current parameter values.
 * Validation/clamping uses the device's own schema, so values can never leave
 * the legal range. This store is deliberately ignorant of simulation results.
 */
interface DeviceStore {
  deviceId: string;
  values: ParameterValues;
  setDevice: (id: string) => void;
  setParameter: (key: string, value: number | string) => void;
  /** Bulk-apply a value set (e.g. a preset), clamped to the active schema. */
  setValues: (values: ParameterValues) => void;
  reset: () => void;
}

const initialDeviceId = DEFAULT_DEVICE_ID;

function clampAll(deviceId: string, values: ParameterValues): ParameterValues {
  const schema = getDevice(deviceId).parameterSchema;
  const out: Record<string, number | string> = { ...values };
  for (const group of schema.groups) {
    for (const p of group.parameters) {
      if (p.key in out) out[p.key] = clampParameter(p, out[p.key]!);
    }
  }
  return out;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  deviceId: initialDeviceId,
  values: defaultValues(getDevice(initialDeviceId).parameterSchema),
  setDevice: (id) =>
    set({ deviceId: id, values: defaultValues(getDevice(id).parameterSchema) }),
  setParameter: (key, value) => {
    const { deviceId, values } = get();
    const schema = getDevice(deviceId).parameterSchema;
    const descriptor = schema.groups.flatMap((g) => g.parameters).find((p) => p.key === key);
    if (!descriptor) return;
    set({ values: { ...values, [key]: clampParameter(descriptor, value) } });
  },
  setValues: (values) =>
    set((s) => ({ values: clampAll(s.deviceId, { ...s.values, ...values }) })),
  reset: () =>
    set((s) => ({ values: defaultValues(getDevice(s.deviceId).parameterSchema) })),
}));

export { clampAll };
