import type { AnyDevice, DeviceDefinition } from './device.types';
import { nmosDevice } from './nmos.device';
import { pmosDevice } from './pmos.device';
import { cmosInverter } from './cmos-inverter.device';
import { nand2 } from './nand2.device';
import { and2 } from './and2.device';
import { or2 } from './or2.device';
import { mosfetDevice } from './mosfet.device';
import { finfetDevice } from './finfet.device';

/**
 * Device registry: id → definition. Order here IS the learning progression —
 * single transistors first (NMOS → PMOS), then the first gate built from them
 * (CMOS Inverter), then more complex gates. `hidden` devices stay registered
 * (and reachable by id / preset) but are kept out of the primary navigation.
 * `mosfetDevice`/`finfetDevice` are appended last so they don't change the
 * existing default device or nav order for NMOS/PMOS/CMOS Inverter.
 */
const DEVICES: readonly AnyDevice[] = [nmosDevice, pmosDevice, cmosInverter, nand2, and2, or2, mosfetDevice, finfetDevice];

const BY_ID = new Map(DEVICES.map((d) => [d.id, d]));

/**
 * The device the app opens on. Declared separately from registry order so the
 * nav can keep the learning progression (NMOS -> PMOS -> Inverter) while the
 * landing device is the CMOS inverter.
 */
export const DEFAULT_DEVICE_ID = 'cmos-inverter';

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
