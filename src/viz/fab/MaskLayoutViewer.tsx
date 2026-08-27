'use client';
import { useState } from 'react';
import { FAB_STAGES, type FabStep } from '@/domain/education/fab-process';
import { useAvsarStore } from '@/state/useAvsarStore';
import { useThemeStore } from '@/ui/theme';

const getLayers = (isDark: boolean) => ({
  nwell: { id: 'nwell', name: 'N-Well', color: isDark ? 'rgba(230, 168, 142, 0.4)' : 'rgba(230, 168, 142, 0.25)', stroke: isDark ? '#e6a88e' : '#c47c61' }, // warm salmon
  pwell: { id: 'pwell', name: 'P-Well (Substrate)', color: isDark ? 'rgba(218, 217, 211, 0.3)' : 'rgba(218, 217, 211, 0.4)', stroke: isDark ? '#dad9d3' : '#a6a59e' }, // pale gray
  active: { id: 'active', name: 'Active Area (OD)', color: isDark ? 'rgba(134, 215, 230, 0.4)' : 'rgba(134, 215, 230, 0.35)', stroke: isDark ? '#86d7e6' : '#45aabf' }, // oxide base
  poly: { id: 'poly', name: 'Polysilicon (Gate)', color: isDark ? 'rgba(210, 59, 45, 0.6)' : 'rgba(210, 59, 45, 0.4)', stroke: isDark ? '#d23b2d' : '#b82e21' }, // red
  nplus: { id: 'nplus', name: 'N+ Implant', color: isDark ? 'rgba(230, 150, 60, 0.4)' : 'rgba(230, 150, 60, 0.3)', stroke: isDark ? '#e6963c' : '#c87a27' }, // orange
  pplus: { id: 'pplus', name: 'P+ Implant', color: isDark ? 'rgba(94, 169, 91, 0.4)' : 'rgba(94, 169, 91, 0.3)', stroke: isDark ? '#5ea95b' : '#458b42' }, // green
  contact: { id: 'contact', name: 'Contact', color: isDark ? 'rgba(220, 220, 220, 0.9)' : 'rgba(47, 124, 212, 0.8)', stroke: isDark ? '#fff' : '#2162ab' }, // blue pillar
  metal1: { id: 'metal1', name: 'Metal 1', color: isDark ? 'rgba(47, 124, 212, 0.5)' : 'rgba(47, 124, 212, 0.3)', stroke: isDark ? '#2f7cd4' : '#2162ab' }, // metal blue
});

// CMOS Inverter Polygons (Units: arbitrary layout units)
const POLYGONS = {
  nwell: [{ x: 10, y: 10, w: 180, h: 140 }],
  pwell: [{ x: 190, y: 10, w: 180, h: 140 }],
  active: [
    { x: 40, y: 40, w: 120, h: 60 }, // PMOS Active
    { x: 220, y: 40, w: 120, h: 60 }, // NMOS Active
    { x: 25, y: 115, w: 40, h: 20 }, // N-Well Tie Active
    { x: 305, y: 115, w: 40, h: 20 }, // P-Well Tie Active
  ],
  poly: [
    { x: 90, y: 20, w: 20, h: 100 }, // PMOS Gate
    { x: 270, y: 20, w: 20, h: 100 }, // NMOS Gate
    { x: 90, y: 70, w: 200, h: 20 }, // Poly Routing connecting gates
  ],
  nplus: [
    { x: 210, y: 30, w: 140, h: 80 }, // NMOS N+ Implant
    { x: 20, y: 110, w: 50, h: 30 }, // N-Well Tie (N+)
  ],
  pplus: [
    { x: 30, y: 30, w: 140, h: 80 }, // PMOS P+ Implant
    { x: 300, y: 110, w: 50, h: 30 }, // P-Well Tie (P+)
  ],
  contact: [
    { x: 50, y: 55, w: 10, h: 10 }, { x: 70, y: 55, w: 10, h: 10 }, // PMOS Source (VDD)
    { x: 120, y: 55, w: 10, h: 10 }, { x: 140, y: 55, w: 10, h: 10 }, // PMOS Drain (Vout)
    { x: 230, y: 55, w: 10, h: 10 }, { x: 250, y: 55, w: 10, h: 10 }, // NMOS Drain (Vout)
    { x: 300, y: 55, w: 10, h: 10 }, { x: 320, y: 55, w: 10, h: 10 }, // NMOS Source (GND)
    { x: 185, y: 75, w: 10, h: 10 }, // Gate Contact (Vin)
    { x: 40, y: 120, w: 10, h: 10 }, // N-Well Contact
    { x: 320, y: 120, w: 10, h: 10 }, // P-Well Contact
  ],
  metal1: [
    { x: 40, y: 45, w: 50, h: 30 }, // VDD to PMOS Source
    { x: 110, y: 45, w: 160, h: 30 }, // PMOS Drain to NMOS Drain (Vout)
    { x: 290, y: 45, w: 50, h: 30 }, // GND to NMOS Source
    { x: 175, y: 65, w: 30, h: 30 }, // Vin to Poly
    { x: 30, y: 110, w: 30, h: 30 }, // VDD to N-Well Tie
    { x: 310, y: 110, w: 30, h: 30 }, // GND to P-Well Tie
  ]
};

export function MaskLayoutViewer({ step }: { step: FabStep }) {
  const i = FAB_STAGES.indexOf(step.stage);
  const ge = (s: string) => i >= FAB_STAGES.indexOf(s as any);
  
  const v = useAvsarStore((s) => s.wafer_state.visibleLayers);
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'dark';
  const LAYERS = getLayers(isDark);
  
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);

  // Determine which layout layers should be physically present based on the fabrication step
  const activeLayers = {
    nwell: ge('nwell'),
    pwell: ge('pwell'),
    active: ge('sti'), // Active area is defined once STI is etched/filled
    poly: ge('gate'),
    nplus: ge('sd'), // Assuming deep S/D defines the main implant visually
    pplus: ge('sd'),
    contact: ge('contact'),
    metal1: ge('metal1'),
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="absolute top-4 left-4 z-10 rounded-lg p-2 glass">
        <h3 className="eyebrow mb-2 text-[10px] text-ink-muted">Mask Layout</h3>
        <div className="flex flex-col gap-1">
          {Object.entries(LAYERS).map(([key, layer]) => {
            const isPresent = (activeLayers as any)[key];
            const isVisible = (v as any)[key] ?? true; // fallback to true if toggle not explicitly managed
            
            if (!isPresent) return null;

            return (
              <label 
                key={key} 
                className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted hover:text-ink transition"
                onMouseEnter={() => setHoveredLayer(key)}
                onMouseLeave={() => setHoveredLayer(null)}
              >
                <div 
                  className="h-3 w-3 rounded-sm border" 
                  style={{ backgroundColor: layer.color, borderColor: layer.stroke }}
                />
                <span className={!isVisible ? 'line-through opacity-50' : ''}>{layer.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-8">
        <svg 
          viewBox="0 0 380 180" 
          className="h-full w-full"
          style={{ vectorEffect: 'non-scaling-stroke' }}
        >
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" className="dark:stroke-white/5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Render polygons in correct stacking order */}
          {Object.entries(POLYGONS).map(([key, rects]) => {
            const isPresent = (activeLayers as any)[key];
            const isVisible = (v as any)[key] ?? true;
            if (!isPresent || !isVisible) return null;

            const layerDef = (LAYERS as any)[key];
            const isHovered = hoveredLayer === key;

            return (
              <g key={key} style={{ transition: 'opacity 0.2s', opacity: hoveredLayer && !isHovered ? 0.3 : 1 }}>
                {rects.map((r, idx) => (
                  <rect
                    key={`${key}-${idx}`}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill={layerDef.color}
                    stroke={layerDef.stroke}
                    strokeWidth={isHovered ? 2 : 1}
                    rx={key === 'contact' ? 2 : 0}
                    className="transition-all duration-200"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      
      <div className="absolute bottom-4 right-4 z-10 bg-surface-elevated/80 px-2 py-1 rounded text-[10px] font-mono text-ink-muted">
        Scale: 1 unit = 0.01 µm
      </div>
    </div>
  );
}
