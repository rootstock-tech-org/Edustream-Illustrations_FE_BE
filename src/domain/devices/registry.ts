import type { DeviceDefinition } from './device.types';
import { cmosInverter } from './cmos-inverter.device';
import { nand2 } from './nand2.device';

/**
 * Device registry: id → definition. Adding a device means registering it here;
 * every consumer (UI picker, engine, viz) reads from this list generically.
 */
const DEVICES: readonly DeviceDefinition[] = [cmosInverter, nand2];

const BY_ID = new Map(DEVICES.map((d) => [d.id, d]));

export const listDevices = (): readonly DeviceDefinition[] => DEVICES;

export function getDevice(id: string): DeviceDefinition {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown device '${id}'`);
  return d;
}
