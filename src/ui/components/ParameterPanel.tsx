'use client';
import { useDevice } from '@/ui/hooks/useDevice';
import { ParameterControl } from './ParameterControl';

/** Auto-generated control panel for the active device's parameter schema. */
export function ParameterPanel() {
  const { device, values, setParameter } = useDevice();

  return (
    <section aria-label="Device parameters" className="flex flex-col gap-5">
      {device.parameterSchema.groups.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-3">
          <legend className="eyebrow text-[10px] text-accent">{group.title}</legend>
          {group.parameters.map((p) => (
            <ParameterControl
              key={p.key}
              descriptor={p}
              value={values[p.key] ?? 0}
              onChange={(v) => setParameter(p.key, v)}
            />
          ))}
        </fieldset>
      ))}
    </section>
  );
}
