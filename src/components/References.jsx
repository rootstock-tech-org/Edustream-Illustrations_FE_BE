/**
 * References.jsx
 * -------------
 * A working "References" panel: design-reference sources and suggested image
 * searches (from the PRD's Visual References section). Every item is a real
 * clickable link that opens in a new tab. Reusable across every module tool.
 */
import { ExternalLink, Search } from 'lucide-react';

const SOURCES = [
  { name: 'Siemens Industrial UI', url: 'https://www.siemens.com' },
  { name: 'Rockwell Automation', url: 'https://www.rockwellautomation.com' },
  { name: 'AWS Architecture Icons', url: 'https://aws.amazon.com/architecture/icons/' },
  { name: 'Cisco', url: 'https://www.cisco.com' },
  { name: 'Figma Community', url: 'https://www.figma.com/community' },
  { name: 'Freepik', url: 'https://www.freepik.com' },
];

const DEFAULT_SEARCHES = [
  'Smart factory isometric',
  'RAMI 4.0 diagram',
  'ISA-95 pyramid',
  'MQTT architecture',
  'Edge computing architecture',
  'Digital twin manufacturing',
  'PLC SCADA architecture',
  'Industrial robot cell',
  'Predictive maintenance dashboard',
];

const imageSearch = (term) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}`;

export default function References({ searches = DEFAULT_SEARCHES }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Design reference sources</p>
        <div className="space-y-1.5">
          {SOURCES.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-300"
            >
              {s.name}
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Suggested image searches</p>
        <div className="flex flex-wrap gap-1.5">
          {searches.map((q) => (
            <a
              key={q}
              href={imageSearch(q)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/50 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-brand-500/40 hover:text-brand-300"
            >
              <Search className="h-2.5 w-2.5 opacity-60" />
              {q}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
