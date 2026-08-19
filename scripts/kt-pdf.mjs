// Renders docs/kt/KNOWLEDGE-TRANSFER.md → KNOWLEDGE-TRANSFER.pdf.
// Uses marked for HTML and headless Chrome for printing — no Playwright browser
// download required. Run: node scripts/kt-pdf.mjs
//
// Images use relative paths (screens/*.png); the temp HTML is written into
// docs/kt/ so they resolve. Section links work because the document carries
// explicit <a name="..."> anchors (marked v18 no longer emits heading ids).
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

const dir = 'docs/kt';
const md = readFileSync(`${dir}/KNOWLEDGE-TRANSFER.md`, 'utf8');
const body = marked.parse(md);

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #1a2230; line-height: 1.5; font-size: 12px; max-width: 100%; margin: 0; }
  h1 { font-size: 26px; border-bottom: 3px solid #184B8A; padding-bottom: 6px; color: #0E1116; }
  h2 { font-size: 19px; margin-top: 26px; border-bottom: 1px solid #d6dbe3; padding-bottom: 4px;
       color: #184B8A; page-break-after: avoid; }
  h3 { font-size: 15px; margin-top: 18px; color: #1B3D39; page-break-after: avoid; }
  h4 { font-size: 13px; color: #35506e; page-break-after: avoid; }
  p, li { font-size: 12px; }
  code { font-family: "SF Mono", Menlo, "DejaVu Sans Mono", Consolas, monospace; font-size: 10.5px;
         background: #eef1f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #0e1116; color: #e6edf3; padding: 12px 14px; border-radius: 8px;
        overflow-x: hidden; page-break-inside: avoid; }
  pre code { background: none; color: #e6edf3; padding: 0; font-size: 10px; line-height: 1.45;
             white-space: pre; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11px;
          page-break-inside: avoid; }
  th, td { border: 1px solid #ccd3dd; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef1f5; color: #184B8A; }
  tr { page-break-inside: avoid; }
  img { max-width: 100%; height: auto; border: 1px solid #d6dbe3; border-radius: 6px;
        margin: 8px 0; page-break-inside: avoid; display: block; }
  blockquote { border-left: 4px solid #35C8FF; margin: 10px 0; padding: 4px 14px;
               background: #f3f9fc; color: #2a3a4a; }
  a { color: #184B8A; text-decoration: none; }
  hr { border: none; border-top: 1px solid #d6dbe3; margin: 22px 0; }
  h2, h3 { page-break-inside: avoid; }
</style></head><body>${body}</body></html>`;

const tmp = `${dir}/_kt-print.html`;
writeFileSync(tmp, html);

execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--no-pdf-header-footer',
  '--virtual-time-budget=20000', // let every screenshot decode before printing
  `--print-to-pdf=${process.cwd()}/${dir}/KNOWLEDGE-TRANSFER.pdf`,
  `file://${process.cwd()}/${tmp}`,
], { stdio: 'pipe' });

unlinkSync(tmp);
console.log('PDF written:', `${dir}/KNOWLEDGE-TRANSFER.pdf`);
