// Renders docs/EQUATIONS.md → docs/EQUATIONS.pdf.
// Uses marked for HTML and headless Chrome for printing — no Playwright browser
// download required. Run: node scripts/equations-pdf.mjs
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { marked } from 'marked';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error(`No Chrome-family browser found. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);

const dir = 'docs';
const md = readFileSync(`${dir}/EQUATIONS.md`, 'utf8');

// Source links (../src/...) are dead in a PDF — keep the text, drop the href so
// nothing looks clickable-but-broken.
const body = marked
  .parse(md, { mangle: false, headerIds: true })
  .replace(/<a href="\.\.[^"]*">([^<]*)<\/a>/g, '<code class="ref">$1</code>');

const stamp = new Date().toISOString().slice(0, 10);

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #1a2230; line-height: 1.5; font-size: 11.5px; max-width: 100%; margin: 0; }
  h1 { font-size: 26px; border-bottom: 3px solid #184B8A; padding-bottom: 6px; color: #0E1116; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 26px; border-bottom: 1px solid #d6dbe3; padding-bottom: 4px;
       color: #184B8A; page-break-after: avoid; }
  h3 { font-size: 14px; margin-top: 16px; margin-bottom: 6px; color: #1B3D39; page-break-after: avoid; }
  h4 { font-size: 12px; color: #35506e; page-break-after: avoid; }
  p, li { font-size: 11.5px; }
  ul { margin-top: 4px; padding-left: 18px; }
  li { margin: 2px 0; }
  code { font-family: "SF Mono", Menlo, "DejaVu Sans Mono", Consolas, monospace; font-size: 10px;
         background: #eef1f5; padding: 1px 4px; border-radius: 3px; }
  code.ref { background: #e8f0fa; color: #184B8A; }
  pre { background: #0e1116; color: #e6edf3; border-radius: 6px; padding: 10px 12px;
        overflow-x: hidden; page-break-inside: avoid; margin: 8px 0; }
  pre code { background: none; color: inherit; padding: 0; font-size: 10px; line-height: 1.5;
             white-space: pre; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10.5px;
          page-break-inside: avoid; }
  th, td { border: 1px solid #d6dbe3; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eef1f5; color: #184B8A; font-weight: 600; }
  tr { page-break-inside: avoid; }
  /* Section 8's dependency matrix is 12 columns wide — tighten it. */
  table:has(th:nth-child(12)) { font-size: 8.5px; }
  table:has(th:nth-child(12)) th,
  table:has(th:nth-child(12)) td { padding: 3px 3px; text-align: center; }
  table:has(th:nth-child(12)) td:first-child,
  table:has(th:nth-child(12)) th:first-child { text-align: left; }
  hr { border: 0; border-top: 1px solid #e3e7ee; margin: 20px 0; }
  strong { color: #0E1116; }
  em { color: #35506e; }
  .stamp { color: #8895a7; font-size: 10px; margin: 0 0 18px; }
</style></head><body>
${body.replace('</h1>', `</h1><p class="stamp">Probe Station · generated from source · ${stamp}</p>`)}
</body></html>`;

const tmp = `${dir}/_eq-print.html`;
writeFileSync(tmp, html);

execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  '--virtual-time-budget=5000',
  `--print-to-pdf=${process.cwd()}/${dir}/EQUATIONS.pdf`,
  `file://${process.cwd()}/${tmp}`,
], { stdio: 'pipe' });

unlinkSync(tmp);
console.log('PDF written:', `${dir}/EQUATIONS.pdf`);
