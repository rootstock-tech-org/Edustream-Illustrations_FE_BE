'use client';
import { useDeviceStore } from '@/state/device.store';
import { getDevice, listDevices } from '@/domain/devices/registry';

/** Presentation-facing view of the device store. No logic, just wiring. */
export function useDevice() {
  const deviceId = useDeviceStore((s) => s.deviceId);
  const values = useDeviceStore((s) => s.values);
  const setParameter = useDeviceStore((s) => s.setParameter);
  const setDevice = useDeviceStore((s) => s.setDevice);
  const setValues = useDeviceStore((s) => s.setValues);
  return {
    deviceId,
    values,
    setParameter,
    setDevice,
    setValues,
    device: getDevice(deviceId),
    devices: listDevices(),
  };
}
