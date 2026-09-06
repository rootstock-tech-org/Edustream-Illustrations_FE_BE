/**
 * Do events opened by a browser camera close when that browser goes away?
 *
 * The reported failure — events 214/215 still reading `"ended_at": null`
 * fifteen minutes after the session ended — is about a socket that a *browser*
 * opened, so it is asked of a browser: a real Chromium, a real `WebSocket` to
 * the module's own endpoint, real JPEG frames of a real photograph, and the
 * answer read back through the events API the Events page reads. A raw socket
 * client from Python would exercise the same handler, but it would not carry
 * the browser's origin and would quietly stop testing the thing that broke if
 * the fix ever came to depend on it.
 *
 * Four situations, because "close the module's events when the socket ends"
 * is easy to implement in a way that is worse than the bug. Three sockets are
 * opened — two browsers on the module that is finding something, one browser
 * on a different module — and then closed one at a time:
 *
 *   elsewhere    the stranger closes first. It was never watching this
 *                module, so nothing of this module's may end.
 *
 *   together     one of the two on the same module closes. The one still
 *                watching is still reporting the same problem — ending its
 *                event says a hazard stopped while the camera watching it
 *                says it has not.
 *
 *   alone        the last one closes. *Now* the events must gain an
 *                `ended_at`. This is the defect.
 *
 *   one event    through all of it, an unbroken situation must stay one row.
 *                A close that re-opens on the next frame turns five minutes
 *                of one open door into a list nobody reads.
 *
 * Only one of the seven modules will find anything in a photograph that is
 * merely of a workplace: since Phase 2 the others decline to judge a picture
 * they cannot read well enough, and since Phase 3 a person too small to
 * resolve a hand on is not a finding either. So the stranger socket carries
 * no events of its own, and the isolation measured here is one-directional —
 * a stranger leaving does not end this module's events. The other direction
 * is measured in process, on a scratch database, by the suite.
 *
 * Prints one JSON object on stdout: the event rows before and after each
 * disconnect, and the timings. It decides nothing.
 *
 *   P5_BASE     backend to drive     (default http://127.0.0.1:8013)
 *   P5_PHOTO    JPEG to push         (default tests/fixtures/check_photo.jpg)
 *   P5_MODULES  finder,stranger      (default mask,ppe)
 *   P5_FRAMES   frames per socket    (default 6)
 */

const fs = require("fs");
const path = require("path");

const { chromium } = require("./_pw");

const BASE = process.env.P5_BASE || "http://127.0.0.1:8013";
const PHOTO = process.env.P5_PHOTO ||
  path.join(__dirname, "fixtures", "check_photo.jpg");
const [MODULE_A, MODULE_B] = (process.env.P5_MODULES || "mask,ppe").split(",");
const FRAMES = Number(process.env.P5_FRAMES || 6);

/**
 * Open a socket in the page and push the photograph down it, over and over.
 *
 * Runs in the browser: `window.__push(moduleId)` returns a handle the driver
 * can wait on and close. Frames are paced rather than fired in a burst — the
 * server answers one before reading the next, and a burst would only queue.
 */
const INSTALL = (jpegBase64) => {
  window.__jpeg = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0));
  window.__sockets = {};

  window.__push = (name, moduleId, frames, everyMs) =>
    new Promise((resolve) => {
      const url =
        (location.protocol === "https:" ? "wss://" : "ws://") +
        location.host +
        `/api/${moduleId}/ws?overlay=json`;

      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      const record = {
        name,
        moduleId,
        url,
        sent: 0,
        results: [],
        errors: [],
        closed: null,
        stop: false,
      };

      window.__sockets[name] = record;

      socket.addEventListener("error", () => record.errors.push("socket error"));
      socket.addEventListener("close", (event) => {
        record.closed = { code: event.code, wasClean: event.wasClean };
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          try {
            record.results.push(JSON.parse(event.data));
          } catch {
            record.results.push({ unparsed: String(event.data).slice(0, 200) });
          }
        }
      });

      socket.addEventListener("open", () => {
        record.opened = true;
        let sent = 0;

        const tick = () => {
          if (record.stop || socket.readyState !== WebSocket.OPEN) return;

          socket.send(window.__jpeg);
          record.sent = ++sent;

          if (sent < frames) {
            record.timer = setTimeout(tick, everyMs);
          }
        };

        tick();
        resolve(true);
      });

      // Keeps pushing until told to stop, so a socket can be held open while
      // another one is closed.
      record.keepGoing = (more) => {
        record.stop = false;
        let sent = 0;
        const tick = () => {
          if (record.stop || socket.readyState !== WebSocket.OPEN) return;
          socket.send(window.__jpeg);
          record.sent += 1;
          if (++sent < more) record.timer = setTimeout(tick, everyMs);
        };
        tick();
      };

      record.close = () => {
        record.stop = true;
        clearTimeout(record.timer);
        socket.close();
      };

      window.__close = window.__close || ((which) => {
        const target = window.__sockets[which];
        if (target && target.close) target.close();
      });

      window.__hold = window.__hold || ((which, more) => {
        const target = window.__sockets[which];
        if (target && target.keepGoing) target.keepGoing(more);
      });

      window.__state = window.__state || ((which) => {
        const target = window.__sockets[which];
        if (!target) return null;
        const { name, moduleId, sent, results, errors, closed, opened } = target;
        return {
          name, moduleId, sent, opened, errors, closed,
          results: results.length,
          lastResult: results.length ? results[results.length - 1] : null,
        };
      });
    });
};

(async () => {
  const out = { base: BASE, modules: [MODULE_A, MODULE_B], steps: {} };

  if (!fs.existsSync(PHOTO)) {
    out.error = `no photograph at ${PHOTO}`;
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const jpeg = fs.readFileSync(PHOTO).toString("base64");

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  /** Every event this backend holds for one module, newest first. */
  const events = async (context, moduleId) => {
    const response = await context.request.get(
      `${BASE}/api/events?module=${moduleId}&days=1&limit=200`,
    );
    const body = await response.json();
    return (body?.data?.events || []).map((event) => ({
      id: event.id,
      key: event.event_key,
      occurred_at: event.occurred_at,
      ended_at: event.ended_at,
      summary: event.summary,
    }));
  };

  try {
    const context = await browser.newContext();

    // A page on the product's own origin, so the socket carries the same
    // origin a real operator's would.
    const pageA = await context.newPage();
    await pageA.goto(BASE + "/about", { waitUntil: "domcontentloaded" });
    await pageA.evaluate(INSTALL, jpeg);

    const pageB = await context.newPage();
    await pageB.goto(BASE + "/about", { waitUntil: "domcontentloaded" });
    await pageB.evaluate(INSTALL, jpeg);

    /** What the dashboard believes is feeding it, right now. */
    const cameras = async () => {
      try {
        const status = await context.request.get(BASE + "/system/status");
        return (await status.json())?.data?.camera || null;
      } catch (err) {
        return { error: String(err) };
      }
    };

    out.startedAt = new Date().toISOString();
    out.before = {
      [MODULE_A]: await events(context, MODULE_A),
      [MODULE_B]: await events(context, MODULE_B),
      cameras: await cameras(),
    };

    /* -------------------------------------------------------------- */
    /* Two browsers on one module, and a third on another              */
    /* -------------------------------------------------------------- */

    // Tab 1 and tab 2 both watch module A; tab 2 also watches module B, so
    // one disconnect can be checked against both a sibling on the same
    // module and a stranger on a different one.
    await pageA.evaluate(
      ([moduleId, frames]) => window.__push("first", moduleId, frames, 1200),
      [MODULE_A, FRAMES],
    );
    await pageB.evaluate(
      ([moduleId, frames]) => window.__push("second", moduleId, frames, 1200),
      [MODULE_A, FRAMES],
    );
    await pageB.evaluate(
      ([moduleId, frames]) => window.__push("other", moduleId, frames, 1200),
      [MODULE_B, FRAMES],
    );

    // Long enough for every socket to have had several frames analysed on a
    // CPU, and for the first event to have been written.
    await pageA.waitForTimeout(1200 * FRAMES + 6000);

    out.steps.opened = {
      first: await pageA.evaluate(() => window.__state("first")),
      second: await pageB.evaluate(() => window.__state("second")),
      other: await pageB.evaluate(() => window.__state("other")),
      [MODULE_A]: await events(context, MODULE_A),
      [MODULE_B]: await events(context, MODULE_B),
      cameras: await cameras(),
    };

    /* -------------------------------------------------------------- */
    /* A browser watching a different module closes                    */
    /* -------------------------------------------------------------- */

    // The survivors keep reporting the same problem across every disconnect,
    // which is what makes these tests rather than coincidences: the event
    // must neither be ended nor replaced by a second row until the last
    // camera watching it has gone.
    await pageA.evaluate(() => window.__hold("first", 10));
    await pageB.evaluate(() => window.__hold("second", 10));
    await pageB.evaluate(() => window.__close("other"));
    await pageB.waitForTimeout(6000);

    out.steps.afterStranger = {
      closedSocket: await pageB.evaluate(() => window.__state("other")),
      [MODULE_A]: await events(context, MODULE_A),
      [MODULE_B]: await events(context, MODULE_B),
      cameras: await cameras(),
    };

    /* -------------------------------------------------------------- */
    /* One of two on the same module closes                            */
    /* -------------------------------------------------------------- */

    await pageB.evaluate(() => window.__hold("second", 10));
    await pageA.evaluate(() => window.__close("first"));
    await pageA.waitForTimeout(6000);

    out.steps.afterOneOfTwo = {
      closedSocket: await pageA.evaluate(() => window.__state("first")),
      survivor: await pageB.evaluate(() => window.__state("second")),
      [MODULE_A]: await events(context, MODULE_A),
      [MODULE_B]: await events(context, MODULE_B),
      cameras: await cameras(),
    };

    /* -------------------------------------------------------------- */
    /* The last socket on that module closes                           */
    /* -------------------------------------------------------------- */

    await pageB.evaluate(() => window.__close("second"));
    await pageB.waitForTimeout(6000);

    out.steps.afterLast = {
      [MODULE_A]: await events(context, MODULE_A),
      [MODULE_B]: await events(context, MODULE_B),
      cameras: await cameras(),
    };

    out.finishedAt = new Date().toISOString();
  } catch (err) {
    out.error = String((err && err.stack) || err);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(out));
})();
