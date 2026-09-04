import { SENSORS_SPEC } from './spec.js';
import { evaluate } from './model.js';
import { bind } from '../binding.js';

function show(title, params, faults) {
  const out = evaluate(params, faults);
  const bound = bind(SENSORS_SPEC, out, 12.0);
  console.log(`\n${title}  (load ${params.load}%, rpm ${params.rpm}, amb ${params.ambient}°C${faults ? ', fault: ' + Object.keys(faults).join('+') : ''})`);
  for (const b of bound) {
    console.log(`  ${b.tag.padEnd(7)} ${b.label.padEnd(15)} ${String(b.value).padStart(6)} ${b.displaySymbol.padEnd(5)} [${b.state}]  src=${b.source} q=${b.quality}`);
  }
  // every quantity must carry source + quality (§16 gate)
  const bad = bound.filter((b) => !b.source || !b.quality);
  if (bad.length) { console.log('  FAIL: missing provenance on ' + bad.map((b) => b.tag).join(', ')); process.exitCode = 1; }
}

show('NAMEPLATE', { load: 75, rpm: 1500, ambient: 25 });
show('HIGH LOAD', { load: 110, rpm: 1500, ambient: 35 });
show('BEARING WEAR (insidious)', { load: 75, rpm: 1500, ambient: 25 }, { bearingWear: true });
show('COOLING LOSS', { load: 90, rpm: 1500, ambient: 40 }, { coolingLoss: true });

console.log('\nAll quantities carry source+quality (provenance seam intact).');
