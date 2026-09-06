/**
 * One clock format for every event timestamp: YYYY-MM-DD HH:MM:SS.
 *
 * Two pages used to carry their own copies of a shorter localized form —
 * day, month, no year, no seconds — which could not tell an April event
 * from an August one and drifted between copies. One function now, one
 * format everywhere an event's moment is shown.
 *
 * The `utc` option is really "render the stored digits, don't convert":
 * an event stamped from a recording's burned-in clock stores that clock's
 * own digits shaped as-if-UTC, because the recording never said what
 * timezone it was in. Converting those digits to the viewer's zone would
 * show a time matching neither the video nor any wall — an IST viewer
 * would read 18:54 as 00:24. So CCTV times render as the clock face the
 * footage itself shows, and system times convert to the viewer's zone as
 * they always have.
 *
 * Hand-built from date fields rather than toLocaleString: the format is
 * fixed by requirement, and locale machinery is the thing that varies.
 */

const pad = (value) => String(value).padStart(2, "0");

export function formatWhen(iso, { utc = false } = {}) {
  if (!iso) return "";

  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;

  return utc
    ? `${when.getUTCFullYear()}-${pad(when.getUTCMonth() + 1)}-${pad(when.getUTCDate())} ` +
      `${pad(when.getUTCHours())}:${pad(when.getUTCMinutes())}:${pad(when.getUTCSeconds())}`
    : `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
      `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

/**
 * How to render this event's own moment: the recording's clock face when
 * the timestamp came from the footage, the viewer's zone when it came
 * from the system.
 */
export function whenOptions(event) {
  return { utc: event?.details?.timestamp_source === "cctv" };
}
