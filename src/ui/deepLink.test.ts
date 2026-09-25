/**
 * `?bench=` is how AVSAR's tutor reaches a specific bench. Two things are worth
 * pinning: that a real id opens the right thing, and that a WRONG id opens the
 * default rather than throwing — a link can outlive a bench by months, sitting
 * in a chat transcript, and a learner clicking it should land somewhere.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SECTION_IDS, benchFromSearch, benchIds } from './deepLink';
import { listAllDevices } from '@/domain/devices/registry';
import { BASE_PATH } from '@/lib/basePath';

describe('benchFromSearch', () => {
  it('resolves every registered device by id', () => {
    for (const d of listAllDevices()) {
      expect(benchFromSearch(`?bench=${d.id}`)).toEqual({ kind: 'device', id: d.id });
    }
  });

  it('resolves every full-screen section by id', () => {
    for (const id of SECTION_IDS) {
      expect(benchFromSearch(`?bench=${id}`)).toEqual({ kind: 'section', id });
    }
  });

  it('ignores case and surrounding whitespace', () => {
    expect(benchFromSearch('?bench=%20CMOS-Inverter%20')).toEqual({
      kind: 'device',
      id: 'cmos-inverter',
    });
  });

  it('returns null for an unknown bench rather than throwing', () => {
    // A stale link from an old chat message. The caller opens the default
    // bench; it must never reach `getDevice()`, which throws on unknown ids.
    expect(benchFromSearch('?bench=quantum-tunnelling')).toBeNull();
  });

  it('returns null when the param is absent or empty', () => {
    expect(benchFromSearch('')).toBeNull();
    expect(benchFromSearch('?other=1')).toBeNull();
    expect(benchFromSearch('?bench=')).toBeNull();
  });
});

describe('base path', () => {
  it('matches the literal in next.config.mjs', () => {
    // next.config is loaded before the TS aliases exist, so it cannot import
    // basePath.ts and carries its own literal. These two disagreeing means
    // every hand-built URL lands one directory away from its asset — and AVSAR
    // answers 200 for unknown paths, so it fails silently.
    const cfg = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
    const m = cfg.match(/const BASE_PATH = '([^']+)'/);
    expect(m?.[1]).toBe(BASE_PATH);
  });
});

describe('bench vocabulary', () => {
  it('is exactly sections + registered devices, with no duplicates', () => {
    const ids = benchIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(SECTION_IDS.length + listAllDevices().length);
  });
});
