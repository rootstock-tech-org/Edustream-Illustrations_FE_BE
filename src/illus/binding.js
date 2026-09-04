/*
 * Binding seam (Illustration Rulebook §2.2). Turns raw model output into
 * BoundQuantity[] — each displayed value carries its own provenance (source,
 * quality), unit, display scale and alarm state. Today source is always 'model'
 * / quality 'simulated'; when a real historian/OPC-UA bridge lands, individual
 * quantities flip to 'sensor' and the figure re-renders with zero geometry
 * change. That swap is the entire point of this seam — do not inline values.
 */

// SI → display number, honouring scale + optional offset (e.g. K→°C), rounded to
// the significant figures the model justifies (§8). Never more precision than that.
export function formatValue(si, display, sigFigs) {
  const v = si * (display.scale ?? 1) + (display.offset ?? 0);
  if (!Number.isFinite(v)) return '—';
  const p = Number(v.toPrecision(sigFigs));
  // keep it readable: no exponential for our ranges
  return Math.abs(p) >= 1000 ? String(Math.round(p)) : String(p);
}

// Alarm state from operating limits (§7.5). Never color alone downstream — the
// renderer adds a 2nd cue (glyph/dash) for warning/fault.
export function alarmState(si, limits) {
  if (!limits) return 'normal';
  if ((limits.hiHi != null && si >= limits.hiHi) || (limits.loLo != null && si <= limits.loLo)) return 'fault';
  if ((limits.hi != null && si >= limits.hi) || (limits.lo != null && si <= limits.lo)) return 'warning';
  return 'normal';
}

/**
 * Bind model output to the spec's quantities.
 * @param {object} spec        AssetSpec
 * @param {object} modelOut    evaluate() result keyed by quantity.key
 * @param {number} tSim        simulated clock (seconds since run start)
 * @returns {Array} BoundQuantity[]
 */
export function bind(spec, modelOut, tSim) {
  return spec.quantities.map((q) => {
    const m = modelOut[q.key];
    const si = m ? m.si : NaN;
    return {
      key: q.key,
      tag: q.tag,
      label: q.label,
      si,
      unit: q.unit,
      display: q.display,
      sigFigs: q.sigFigs,
      value: formatValue(si, q.display, q.sigFigs), // display-unit string
      displaySymbol: q.display.symbol,
      state: alarmState(si, q.limits),
      limits: q.limits,
      anchor: q.anchor,
      explanation: m ? m.explanation : null,
      // provenance — required, never removed (§2.2)
      source: 'model',
      quality: Number.isFinite(si) ? 'simulated' : 'bad',
      tSim,
    };
  });
}
