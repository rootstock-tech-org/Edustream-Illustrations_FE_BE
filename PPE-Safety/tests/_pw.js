/**
 * One place that finds Playwright for every probe.
 *
 * The probes used to require it from an absolute scratchpad path — a
 * directory that belongs to one session on one machine and is wiped on
 * every container restart, which is exactly how the whole browser leg of
 * the gates silently lost its instrument twice. Plain resolution instead:
 * `tests/node_modules` first, then anywhere NODE_PATH points. When it is
 * missing the cure is printed rather than a bare MODULE_NOT_FOUND, so the
 * suite's failure line says what to do about it.
 *
 *     cd tests && npm install playwright@1.49
 *
 * The browser binary itself is provisioned by the environment
 * (PLAYWRIGHT_BROWSERS_PATH); installing the package never downloads one.
 */

let playwright;
try {
  playwright = require("playwright");
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    console.error(
      "playwright is not installed for the probes — run: " +
      "cd tests && npm install playwright@1.49"
    );
  }
  throw err;
}

module.exports = playwright;
