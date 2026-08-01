'use client';

export interface ChipPin {
  readonly label: string;
  readonly on: boolean;
  readonly color: string;
}

/**
 * A colour-coded 3D-ish "chip" diagram: a gradient rounded body with labelled,
 * colour-coded pin wires on the left/right (and optional short "leg" pins on
 * the bottom for select lines) — the same visual language as the reference
 * MUX/DEMUX/Encoder/Decoder infographic. Reused for all four combinational
 * devices; only pin counts/colours/labels differ per device.
 */
export function ChipDiagram({
  title,
  subtitle,
  accent,
  accentDark,
  leftPins,
  rightPins,
  bottomPins,
  onLeftClick,
  onBottomClick,
  pulseTick,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  accentDark: string;
  leftPins: readonly ChipPin[];
  rightPins: readonly ChipPin[];
  bottomPins?: readonly ChipPin[];
  onLeftClick?: (index: number) => void;
  onBottomClick?: (index: number) => void;
  pulseTick: number;
}) {
  const rows = Math.max(leftPins.length, rightPins.length, 1);
  // Shrink row spacing for wide-fan-in devices (Encoder/Decoder, 8 pins) so
  // their chip body stays roughly the same size as MUX/DEMUX (4 pins) instead
  // of growing 2x taller.
  const rowH = Math.min(22, Math.max(13, Math.round(120 / rows)));
  const padY = 18;
  const hasBottom = !!bottomPins?.length;
  const chipH = rows * rowH;
  const height = chipH + padY * 2 + (hasBottom ? 30 : 0);
  const width = 340;
  const chipX = 110;
  const chipW = 120;
  const chipY = padY;
  const gradId = `chip-grad-${title.replace(/\W+/g, '')}`;

  const yFor = (i: number, n: number) => chipY + ((i + 0.5) * chipH) / n;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title} chip diagram`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={accentDark} />
        </linearGradient>
      </defs>

      {leftPins.map((pin, i) => {
        const y = yFor(i, leftPins.length);
        const clickable = !!onLeftClick;
        return (
          <g key={pin.label} className="wire-flow">
            <line x1={4} y1={y} x2={chipX} y2={y} stroke="rgb(var(--ink-muted))" strokeWidth={1.2} />
            <circle
              cx={4}
              cy={y}
              r={5}
              fill={pin.on ? pin.color : 'rgb(var(--ink-muted))'}
              style={{ transition: 'fill 300ms ease', cursor: clickable ? 'pointer' : 'default' }}
              onClick={clickable ? () => onLeftClick!(i) : undefined}
            />
            <text
              x={10}
              y={y - 6}
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="rgb(var(--ink-muted))"
              style={{ cursor: clickable ? 'pointer' : 'default' }}
              onClick={clickable ? () => onLeftClick!(i) : undefined}
            >
              {pin.label}
            </text>
          </g>
        );
      })}

      {rightPins.map((pin, i) => {
        const y = yFor(i, rightPins.length);
        return (
          <g key={pin.label} className="wire-flow">
            <line x1={chipX + chipW} y1={y} x2={width - 4} y2={y} stroke="rgb(var(--ink-muted))" strokeWidth={1.2} />
            <circle cx={width - 4} cy={y} r={5} fill={pin.on ? pin.color : 'rgb(var(--ink-muted))'} style={{ transition: 'fill 300ms ease' }} />
            <text x={width - 10} y={y - 6} textAnchor="end" fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">
              {pin.label}
            </text>
          </g>
        );
      })}

      {bottomPins?.map((pin, i) => {
        const n = bottomPins.length;
        const x = chipX + ((i + 0.5) * chipW) / n;
        const legY = chipY + chipH;
        const clickable = !!onBottomClick;
        return (
          <g key={pin.label} onClick={clickable ? () => onBottomClick!(i) : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}>
            <line x1={x} y1={legY} x2={x} y2={legY + 16} stroke={pin.on ? pin.color : 'rgb(var(--ink-muted))'} strokeWidth={2} style={{ transition: 'stroke 300ms ease' }} />
            <text x={x} y={legY + 27} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">
              {pin.label}
            </text>
          </g>
        );
      })}

      <g key={pulseTick} className={pulseTick ? 'gate-flash' : undefined}>
        <rect x={chipX} y={chipY} width={chipW} height={chipH} rx={10} fill={`url(#${gradId})`} className="drop-shadow-md" />
        {title.split('\n').map((line, i, all) => (
          <text
            key={line}
            x={chipX + chipW / 2}
            y={chipY + chipH / 2 + (i - (all.length - 1) / 2) * 15 - (subtitle ? 5 : 0)}
            textAnchor="middle"
            fontSize={13}
            fontWeight={800}
            fill="#fff"
          >
            {line}
          </text>
        ))}
        {subtitle && (
          <text x={chipX + chipW / 2} y={chipY + chipH / 2 + 22} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.85)">
            {subtitle}
          </text>
        )}
      </g>
    </svg>
  );
}
