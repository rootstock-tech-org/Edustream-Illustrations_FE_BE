// Renders docs/kt/KNOWLEDGE-TRANSFER.md → KNOWLEDGE-TRANSFER.pdf via marked + Playwright.
// Images use relative paths (screens/*.png); we load the HTML from docs/kt/ so they resolve.
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { marked } from 'marked';
import { chromium } from 'playwright';

const dir = 'docs/kt';
const md = readFileSync(`${dir}/KNOWLEDGE-TRANSFER.md`, 'utf8');
const body = marked.parse(md, { mangle: false, headerIds: true });

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #1a2230; line-height: 1.5; font-size: 12px; max-width: 100%; }
  h1 { font-size: 26px; border-bottom: 3px solid #184B8A; padding-bottom: 6px; color: #0E1116; }
  h2 { font-size: 19px; margin-top: 26px; border-bottom: 1px solid #d6dbe3; padding-bottom: 4px; color: #184B8A; page-break-after: avoid; }
  h3 { font-size: 15px; margin-top: 18px; color: #1B3D39; page-break-after: avoid; }
  h4 { font-size: 13px; color: #35506e; page-break-after: avoid; }
  p, li { font-size: 12px; }
  code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 10.5px;
         background: #eef1f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #0e1116; color: #e6edf3; padding: 12px 14px; border-radius: 8px;
        overflow-x: auto; page-break-inside: avoid; }
  pre code { background: none; color: #e6edf3; padding: 0; font-size: 10px; line-height: 1.45; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 11px; page-break-inside: avoid; }
  th, td { border: 1px solid #ccd3dd; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef1f5; }
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

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`file://${process.cwd()}/${tmp}`, { waitUntil: 'networkidle' });
await p.pdf({
  path: `${dir}/KNOWLEDGE-TRANSFER.pdf`,
  format: 'A4',
  printBackground: true,
  margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#8895a7;text-align:center;">Probe Station — Knowledge Transfer · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await b.close();
unlinkSync(tmp);
console.log('PDF written:', `${dir}/KNOWLEDGE-TRANSFER.pdf`);
