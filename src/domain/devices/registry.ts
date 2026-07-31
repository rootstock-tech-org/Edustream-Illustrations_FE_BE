import type { AnyDevice, DeviceDefinition } from './device.types';
import { nmosDevice } from './nmos.device';
import { pmosDevice } from './pmos.device';
import { cmosInverter } from './cmos-inverter.device';
import { nand2 } from './nand2.device';
import { mosfetDevice } from './mosfet.device';

/**
 * Device registry: id → definition. Order here IS the learning progression —
 * single transistors first (NMOS → PMOS), then the first gate built from them
 * (CMOS Inverter), then more complex gates. `hidden` devices stay registered
 * (and reachable by id / preset) but are kept out of the primary navigation.
 * `mosfetDevice` is appended last so it doesn't change the existing default
 * device or nav order for NMOS/PMOS/CMOS Inverter.
 */
const DEVICES: readonly AnyDevice[] = [nmosDevice, pmosDevice, cmosInverter, nand2, mosfetDevice];

const BY_ID = new Map(DEVICES.map((d) => [d.id, d]));

/** Devices shown in the primary navigation (in learning order). */
export const listDevices = (): readonly AnyDevice[] => DEVICES.filter((d) => !d.hidden);

/** Every registered device, including hidden ones (for lookup by id / presets). */
export const listAllDevices = (): readonly AnyDevice[] => DEVICES;

export function getDevice(id: string): AnyDevice {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown device '${id}'`);
  return d;
}

/** Narrow to a gate device — throws for single-transistor devices. */
export function getGateDevice(id: string): DeviceDefinition {
  const d = getDevice(id);
  if (d.kind !== 'gate') throw new Error(`Device '${id}' is not a gate device`);
  return d;
}
