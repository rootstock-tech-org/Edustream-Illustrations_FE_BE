import { useCallback } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useDeviceStore } from '@/state/device.store';
import { getDevice } from '@/domain/devices/registry';
import { clampParameter, type ParameterDescriptor } from '@/domain/parameters/parameter.schema';

function findDescriptor(deviceId: string, key: string): ParameterDescriptor | undefined {
  return getDevice(deviceId)
    .parameterSchema.groups.flatMap((g) => g.parameters)
    .find((p) => p.key === key);
}

/**
 * Turns a 3D handle drag into a live parameter edit. Screen movement is mapped
 * multiplicatively to the parameter (natural for log-ranged geometry), clamped
 * to the schema bounds, and written through the EXISTING `setParameter` setter —
 * the same path the sliders use. No engine/state logic is changed; the device
 * simply becomes another input surface. Hold Shift for fine control.
 */
export function useParamDrag(paramKey: string, axis: 'x' | 'y', sensitivity = 0.006) {
  // OrbitControls (makeDefault) listens on the canvas DOM, so we must disable it
  // for the duration of a handle drag — otherwise the camera rotates too.
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  return useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const { deviceId, values, setParameter } = useDeviceStore.getState();
      const descriptor = findDescriptor(deviceId, paramKey);
      if (!descriptor || descriptor.kind.type !== 'continuous') return;

      const start = axis === 'x' ? e.clientX : e.clientY;
      const startVal = Number(values[paramKey]);
      if (controls) controls.enabled = false;
      document.body.style.cursor = axis === 'x' ? 'ew-resize' : 'ns-resize';

      const move = (ev: PointerEvent) => {
        const cur = axis === 'x' ? ev.clientX : ev.clientY;
        // Screen-up / drag-right increases the value.
        const dpx = axis === 'y' ? -(cur - start) : cur - start;
        const scale = ev.shiftKey ? sensitivity * 0.25 : sensitivity;
        const next = startVal * Math.exp(dpx * scale);
        setParameter(paramKey, clampParameter(descriptor, next));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.style.cursor = '';
        if (controls) controls.enabled = true;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [paramKey, axis, sensitivity, controls],
  );
}
