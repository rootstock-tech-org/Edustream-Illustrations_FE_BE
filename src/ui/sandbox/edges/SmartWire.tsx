import React from 'react';
import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export function SmartWire(props: EdgeProps) {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    animated,
  } = props;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16, // Smoother rounded corners for a modern feel
  });

  return (
    <BaseEdge
      path={edgePath}
      {...(typeof markerEnd === 'string' ? { markerEnd } : {})}
      style={{
        ...style,
        strokeWidth: style.strokeWidth ?? 2,
        stroke: style.stroke ?? 'rgb(var(--ink-muted))',
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.1))'
      }}
      className={`smart-wire-edge ${animated ? 'animated-edge' : ''}`}
    />
  );
}
