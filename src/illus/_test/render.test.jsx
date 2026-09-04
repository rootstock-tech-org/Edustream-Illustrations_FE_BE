/*
 * §14.4 render tests — every figure, all 10 tools. Asserts render.determinism
 * (identical props → byte-identical SVG), a11y.labels (role/title/desc), the
 * mandatory provenance badge (§2.4), and a byte-stable snapshot.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TOOLS, nameplate } from './tools.js';
import { bind } from '../binding.js';

function render(tool) {
  const params = nameplate(tool.spec);
  const bound = bind(tool.spec, tool.evaluate(params), 0);
  return renderToStaticMarkup(
    createElement(tool.Figure, { spec: tool.spec, bound, params, tSim: 0, onPick: () => {}, selected: null }),
  );
}

describe.each(TOOLS)('$slug — render', (tool) => {
  it('is deterministic — identical props give byte-identical SVG (§14.4)', () => {
    expect(render(tool)).toBe(render(tool));
  });

  it('exposes accessible labels: role=img, <title>, <desc> (§13, §14.4 a11y)', () => {
    const svg = render(tool);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title');
    expect(svg).toContain('<desc');
  });

  it('carries the exact provenance badge (§2.4)', () => {
    expect(render(tool)).toContain('MODEL — NOT CONNECTED TO PLANT');
  });

  it('never leaks the platform-name token (§0.1)', () => {
    expect(render(tool)).not.toContain('{{PLATFORM_NAME}}');
  });

  it('matches its byte-stable snapshot (§14.4 render.snapshot)', () => {
    expect(render(tool)).toMatchSnapshot();
  });
});
