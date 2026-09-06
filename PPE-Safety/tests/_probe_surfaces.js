/**
 * What the screens actually do, measured in a real browser.
 *
 * Every defect this phase closes is a claim about a rendered page, and three
 * of them are specifically claims that the markup and the rendering disagree —
 * a bar whose inline style says `height: 45.7%` and whose rendered height is
 * 0 px, a sidebar with no responsive class that leaves 138 px for the content,
 * a door state the payload spells out and the page paints green. None of that
 * can be measured from JSON, and none of it can be honestly measured from a
 * screenshot either. So everything here is a computed style or a bounding box,
 * taken from the layout engine after the page has settled.
 *
 * Modes, one per invocation, chosen with `P5_MODE`:
 *
 *   chart    the reports day-by-day chart, at one viewport width. The
 *            summary the page reads is intercepted and served from a fixed
 *            body — once with the *real* one this backend just returned, once
 *            with the report's own 129/59/27 — so the heights measured and the
 *            numbers they are checked against came from the same bytes. A
 *            shared database another agent is writing to would otherwise move
 *            between the page's fetch and the checker's.
 *
 *   small    one page at 390 px: what overflows, what is truncated, how many
 *            words fit on a line, how much width the content is left with,
 *            and whether the navigation can still be reached.
 *
 *   doors    the door list, with a payload injected through the module's own
 *            endpoints: one closed door, one open, one unreliable, one in a
 *            box holding two doorways. What is measured is the *colours the
 *            page itself uses* for its clean and its warning states, so this
 *            probe never has to know what the palette is — only whether the
 *            new state is painted like the green one.
 *
 *   text     the words on a page, and the config behind them: the face page's
 *            statement about the watchlist, the workstation page's allowance
 *            panel beside the grace the backend publishes.
 *
 * Environment:
 *   P5_BASE   backend to drive          (default http://127.0.0.1:8013)
 *   P5_MODE   chart | small | doors | text
 *   P5_WIDTH  viewport width            (default 1440)
 *   P5_PATH   route, for `small`        (default /dashboard)
 *
 * Prints one JSON object on stdout. It decides nothing; `verify_phase5.py`
 * does that.
 */

const { chromium } = require("./_pw");

const BASE = process.env.P5_BASE || "http://127.0.0.1:8013";
const MODE = process.env.P5_MODE || "chart";
const WIDTH = Number(process.env.P5_WIDTH || 1440);
const PATH = process.env.P5_PATH || "/dashboard";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* ------------------------------------------------------------------ */
/* Page-side measurements                                              */
/* ------------------------------------------------------------------ */

/**
 * Every bar in the day-by-day chart, as the layout engine sees it.
 *
 * The inline style is read too, and reported beside the rendered height,
 * because the defect is precisely that the two disagree: asserting the style
 * proves the arithmetic and nothing about the picture.
 */
const READ_CHART = () => {
  const chart = document.querySelector('[role="img"][aria-label^="Events per day"]');

  if (!chart) return { error: "no day-by-day chart on the page" };

  const box = chart.getBoundingClientRect();
  const columns = [...chart.children];

  return {
    label: chart.getAttribute("aria-label"),
    container: { height: box.height, width: box.width, top: box.top },
    columns: columns.map((column) => {
      const bar = column.querySelector("[style*='height']");
      const inner = bar ? bar.querySelector("div") : null;
      const barBox = bar ? bar.getBoundingClientRect() : null;
      const innerBox = inner ? inner.getBoundingClientRect() : null;

      return {
        title: column.getAttribute("title") || "",
        text: column.innerText.trim(),
        columnHeight: column.getBoundingClientRect().height,
        inlineStyle: bar ? bar.getAttribute("style") : null,
        renderedHeight: barBox ? barBox.height : null,
        renderedWidth: barBox ? barBox.width : null,
        innerInlineStyle: inner ? inner.getAttribute("style") : null,
        innerRenderedHeight: innerBox ? innerBox.height : null,
      };
    }),
  };
};

/**
 * How legible and how operable this page is at this width.
 *
 * Each answer is a number rather than a verdict:
 *
 *   overflowing   elements whose right edge is outside the viewport. Clipping
 *                 without a scrollbar is exactly the reported defect — the
 *                 content is gone and nothing says so — so an element being
 *                 off-screen counts whether or not the page can be scrolled
 *                 sideways to reach it.
 *
 *   truncated     elements the layout has actually ellipsised: a `truncate`
 *                 class does nothing until the text is too long for the box,
 *                 so this compares scrollWidth against clientWidth rather
 *                 than reading class names.
 *
 *   perLine       words divided by line boxes, per paragraph. Line boxes are
 *                 counted from the range's own rectangles, so a paragraph
 *                 broken into a column one word wide reads as ~1.0 whatever
 *                 its markup says.
 */
const READ_SMALL = () => {
  const viewport = window.innerWidth;

  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity) === 0) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  const describe = (element) => {
    const box = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      className: String(element.className || "").slice(0, 90),
      text: (element.innerText || "").trim().slice(0, 60),
      left: Math.round(box.left),
      right: Math.round(box.right),
      width: Math.round(box.width),
    };
  };

  const all = [...document.querySelectorAll("body *")].filter(visible);

  // Off the right edge, or off the left. A tolerance of 1 px absorbs
  // sub-pixel layout; anything beyond that is content the operator cannot
  // see.
  const overflowing = all
    .filter((element) => {
      const box = element.getBoundingClientRect();
      return box.right > viewport + 1 || box.left < -1;
    })
    // Only the innermost offenders: a parent is reported by its child, and
    // listing both says the same thing twice.
    .filter((element) => ![...element.children].some((child) => {
      const box = child.getBoundingClientRect();
      return box.right > viewport + 1 || box.left < -1;
    }))
    .map(describe);

  const truncated = all
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.textOverflow !== "ellipsis") return false;
      if (!element.innerText || !element.innerText.trim()) return false;
      return element.scrollWidth > element.clientWidth + 1;
    })
    .map((element) => ({
      ...describe(element),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      // The report names a truncated *title* and a truncated *button*. A
      // long event summary ellipsised in a list is a deliberate choice on any
      // width, so the two are counted apart rather than together.
      heading: /^h[1-6]$/.test(element.tagName.toLowerCase()),
      control:
        element.tagName.toLowerCase() === "button" ||
        element.closest("button, a[href]") !== null,
    }));

  // Clipped: the box hides what does not fit and something does not fit.
  // Distinct from truncated, which at least shows an ellipsis.
  const clipped = all
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.overflowX !== "hidden") return false;
      if (style.textOverflow === "ellipsis") return false;
      return element.scrollWidth > element.clientWidth + 2;
    })
    .filter((element) => ![...element.children].some((child) => {
      const style = getComputedStyle(child);
      return style.overflowX === "hidden" &&
        child.scrollWidth > child.clientWidth + 2;
    }))
    .map((element) => ({
      ...describe(element),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));

  const paragraphs = [...document.querySelectorAll("p, li, dd, .text-sm, .text-xs")]
    .filter(visible)
    // One run of prose, not a stack of them. A panel whose text happens to
    // contain four short blocks would otherwise be measured as one very
    // narrow paragraph and read as a defect that is not there.
    .filter((element) => [...element.children].every((child) => {
      const display = getComputedStyle(child).display;
      return display.startsWith("inline") || display === "contents";
    }))
    .filter((element) => !/\n/.test((element.innerText || "").trim()))
    .map((element) => {
      const words = (element.innerText || "").trim().split(/\s+/).filter(Boolean);
      if (words.length < 6) return null;

      const range = document.createRange();
      range.selectNodeContents(element);

      const rects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );

      // One line box per distinct top edge. Nested inline elements produce
      // several rectangles on the same line, and they share a top.
      const lines = new Set(rects.map((rect) => Math.round(rect.top))).size || 1;

      return {
        ...describe(element),
        words: words.length,
        lines,
        perLine: Number((words.length / lines).toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.perLine - b.perLine);

  const selects = [...document.querySelectorAll("select, [role=combobox], [role=listbox]")]
    .filter(visible)
    .map((element) => {
      const box = element.getBoundingClientRect();
      const parent = element.parentElement;
      const parentBox = parent ? parent.getBoundingClientRect() : null;
      return {
        ...describe(element),
        offRight: box.right > viewport + 1,
        widerThanParent: parentBox ? box.width > parentBox.width + 1 : false,
        insideAClippedBox: (() => {
          let node = element.parentElement;
          while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (style.overflowX === "hidden" || style.overflow === "hidden") {
              const box2 = node.getBoundingClientRect();
              if (box.right > box2.right + 1) return true;
            }
            node = node.parentElement;
          }
          return false;
        })(),
      };
    });

  const main = document.querySelector("main");
  const aside = document.querySelector("aside");

  // Everything the operator can reach from here, and how big a target it is.
  const links = [...document.querySelectorAll("a[href]")]
    .filter(visible)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return {
        href: element.getAttribute("href"),
        text: (element.innerText || "").trim().slice(0, 40),
        height: Math.round(box.height),
        onScreen: box.right <= viewport + 1 && box.left >= -1,
      };
    });

  const controls = [...document.querySelectorAll("button, [role=button]")]
    .filter(visible)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return {
        name: (
          element.getAttribute("aria-label") ||
          element.innerText ||
          ""
        ).trim().slice(0, 40),
        width: Math.round(box.width),
        height: Math.round(box.height),
        onScreen: box.right <= viewport + 1 && box.left >= -1,
      };
    });

  return {
    viewport,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    horizontalScroll: document.documentElement.scrollWidth > viewport + 1,
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
    asideOnScreen: aside
      ? aside.getBoundingClientRect().right > 1 &&
        aside.getBoundingClientRect().left < viewport - 1
      : false,
    overflowing: overflowing.slice(0, 12),
    overflowingCount: overflowing.length,
    truncated: truncated.slice(0, 12),
    truncatedCount: truncated.length,
    clipped: clipped.slice(0, 12),
    clippedCount: clipped.length,
    worstParagraphs: paragraphs.slice(0, 6),
    paragraphCount: paragraphs.length,
    selects,
    links,
    controls,
    title: (document.querySelector("h1")?.innerText || "").trim(),
  };
};

/** The colours one element is painted in, as the page computed them. */
const COLOURS = (element) => {
  const style = getComputedStyle(element);
  return {
    color: style.color,
    background: style.backgroundColor,
    border: style.borderTopColor,
  };
};

/**
 * Each door row: its words, and the colours of its badge and its icon chip.
 *
 * Nothing here is compared against a colour this probe knows. The rows are
 * returned as they were painted and the suite compares the unreliable row
 * with the page's own closed row and its own open row — the palette belongs
 * to the product, and a suite that hardcodes it fails the next time somebody
 * legitimately retunes it.
 */
const READ_DOORS = () => {
  const rows = [...document.querySelectorAll("li")]
    .filter((row) => row.querySelector("span, p"))
    .filter((row) => {
      const box = row.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });

  const colourOf = (element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderTopColor,
    };
  };

  return {
    bodyText: document.body.innerText,
    rows: rows.map((row) => {
      // The badge is the last small pill in the row; the chip is the square
      // icon holder at its start. Found by shape rather than by class, so a
      // refactor of the markup does not read as a missing state.
      const chip = row.querySelector("span[aria-hidden='true']");
      const pills = [...row.querySelectorAll("span, div")].filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 20 && box.width < 260 && box.height > 14 && box.height < 44 &&
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          (element.innerText || "").trim().length > 0
        );
      });

      const badge = pills.length ? pills[pills.length - 1] : null;

      return {
        text: (row.innerText || "").trim(),
        chip: chip ? colourOf(chip) : null,
        badge: badge
          ? { text: (badge.innerText || "").trim(), ...colourOf(badge) }
          : null,
      };
    }),
  };
};

/* ------------------------------------------------------------------ */
/* Driving                                                             */
/* ------------------------------------------------------------------ */

async function settle(page, ms = 1800) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/** A door payload the page will render, whatever the camera is doing. */
function doorFixtures() {
  const doors = [
    { id: 1, name: "Loading bay", state: "closed", open_seconds: 0,
      severity: null, stale: false, seen_now: true, threshold_seconds: 3,
      crowded: false },
    { id: 2, name: "Store room", state: "open", open_seconds: 1.5,
      severity: null, stale: false, seen_now: true, threshold_seconds: 3,
      crowded: false },
    { id: 3, name: "Side exit", state: "unreliable", open_seconds: 0,
      severity: null, stale: false, seen_now: true, threshold_seconds: 3,
      crowded: false },
    { id: 4, name: "Corridor", state: "closed", open_seconds: 0,
      severity: null, stale: false, seen_now: true, threshold_seconds: 3,
      crowded: true },
  ];

  return {
    status: {
      success: true,
      data: {
        module_id: "door", name: "Doors", ready: true, model_loaded: true,
        configured: true, watching: true,
        camera: { connected: true, fps: 10, source: "probe" },
      },
    },
    results: {
      success: true,
      data: {
        alert: false,
        status: "clear",
        summary: "1 door open · 1 unreliable",
        readable: true,
        unreadable_reason: null,
        people_unverified: 0,
        detections: doors,
        doors_total: 4,
        doors_open: 1,
        doors_closed: 2,
        doors_overdue: 0,
        doors_unknown: 0,
        doors_unreliable: 1,
        doors_crowded: 1,
        threshold_seconds: 3,
      },
    },
    config: {
      success: true,
      data: {
        open_seconds: 3, open_seconds_default: 3, confidence: 0.4,
        doors: doors.map((door) => ({
          id: door.id, name: door.name, open_seconds: 3,
          x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.4,
        })),
        calibrated: true, min_side: 0.02, min_area: 0.005,
        max_open_seconds: 3600,
      },
    },
  };
}

(async () => {
  const out = { base: BASE, mode: MODE, width: WIDTH };

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--force-device-scale-factor=1"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: MODE === "small" ? 844 : 1080 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (event) => errors.push(String(event.message)));

    if (MODE === "chart") {
      // The real summary, taken once and then served to the page from a
      // fixed body. The heights below and the counts they are checked
      // against are then provably the same numbers.
      const live = await context.request.get(
        BASE + "/api/events/summary?days=7",
      );
      const real = await live.json();

      out.realSummary = real?.data || null;

      const control = {
        success: true,
        data: {
          since: "2026-08-04T00:00:00+00:00",
          total: 215,
          unacknowledged: 215,
          by_severity: { high: 44, medium: 100, low: 71 },
          by_module: [],
          by_day: [
            { day: "2026-08-06", total: 129, high: 17 },
            { day: "2026-08-07", total: 59, high: 33 },
            { day: "2026-08-08", total: 0, high: 0 },
            { day: "2026-08-09", total: 27, high: 5 },
          ],
        },
      };

      out.control = { by_day: control.data.by_day };

      for (const [name, body] of [["real", real], ["control", control]]) {
        await context.unrouteAll().catch(() => {});
        await context.route("**/api/events/summary**", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(body),
          }),
        );

        await page.goto(BASE + "/reports", { waitUntil: "domcontentloaded" });
        await settle(page);

        out[name] = await page.evaluate(READ_CHART);
      }
    }

    if (MODE === "small") {
      // Every page in one browser: eleven launches is two minutes of nothing
      // but Chromium starting.
      out.pages = {};

      for (const route of PATH.split(",")) {
        const record = { path: route };

        try {
          await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
          await settle(page);

          record.measured = await page.evaluate(READ_SMALL);

          // Can the operator still get anywhere? Either the destinations are
          // on screen already, or one visible control reveals them. Tried
          // rather than assumed: a drawer that cannot be opened is not
          // navigation, and neither is one that opens over the whole screen
          // with no way back.
          const wanted = ["/dashboard", "/events", "/reports", "/monitoring/door"];
          const onScreen = (measured) =>
            wanted.filter((href) =>
              measured.links.some((link) => link.href === href && link.onScreen),
            );

          record.navBefore = onScreen(record.measured);

          if (record.navBefore.length < wanted.length) {
            // `:visible` on every alternative, because the drawer's own
            // close toggle sits inside the off-canvas aside — hidden,
            // aria-hidden, and *earlier in the DOM* than the header's
            // opener. `.first()` without the filter picks that hidden
            // button and times out clicking it, reporting a navigation
            // an operator can actually reach as broken. An operator can
            // only press what is painted.
            const opener = page.locator(
              "button[aria-label*='menu' i]:visible, " +
              "button[aria-label*='nav' i]:visible, " +
              "button[aria-label*='open' i]:visible, " +
              "button[aria-label*='sidebar' i]:visible, " +
              "button[aria-label*='show' i]:visible, " +
              "[role=button][aria-label*='menu' i]:visible",
            ).first();

            record.openerFound = (await opener.count()) > 0;

            if (record.openerFound) {
              const box = await opener.boundingBox().catch(() => null);
              record.openerBox = box
                ? { width: Math.round(box.width), height: Math.round(box.height) }
                : null;
              record.openerName = await opener.getAttribute("aria-label");

              await opener.click({ timeout: 4000 }).catch((err) => {
                record.openerClickError = String(err).slice(0, 200);
              });
              await page.waitForTimeout(900);

              const after = await page.evaluate(READ_SMALL);
              record.afterOpening = {
                overflowingCount: after.overflowingCount,
                horizontalScroll: after.horizontalScroll,
                linksOnScreen: after.links.filter((link) => link.onScreen).length,
              };
              record.navAfter = onScreen(after);
            } else {
              record.navAfter = record.navBefore;
            }
          } else {
            record.navAfter = record.navBefore;
          }
        } catch (err) {
          record.error = String((err && err.stack) || err);
        }

        out.pages[route] = record;
      }
    }

    if (MODE === "doors") {
      const fixtures = doorFixtures();

      await context.route("**/api/door/status", (route) =>
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify(fixtures.status),
        }),
      );
      await context.route("**/api/door/results", (route) =>
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify(fixtures.results),
        }),
      );
      await context.route("**/api/door/config", (route) =>
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify(fixtures.config),
        }),
      );

      await page.goto(BASE + "/monitoring/door", {
        waitUntil: "domcontentloaded",
      });
      await settle(page, 2500);

      out.injected = fixtures.results.data.detections.map((door) => ({
        name: door.name, state: door.state, crowded: door.crowded,
      }));
      out.measured = await page.evaluate(READ_DOORS);
    }

    if (MODE === "text") {
      out.pages = {};

      for (const [name, route] of [
        ["face", "/monitoring/face"],
        ["workstation", "/monitoring/workstation"],
        ["door", "/monitoring/door"],
        ["dashboard", "/dashboard"],
      ]) {
        await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
        await settle(page);
        out.pages[name] = await page.evaluate(() => document.body.innerText);
      }

      for (const endpoint of [
        "/api/workstation/config",
        "/api/door/config",
        "/api/face/status",
      ]) {
        try {
          const response = await context.request.get(BASE + endpoint);
          out[endpoint] = await response.json();
        } catch (err) {
          out[endpoint] = { error: String(err) };
        }
      }
    }

    out.pageErrors = errors;
  } catch (err) {
    out.error = String((err && err.stack) || err);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(out));
})();
