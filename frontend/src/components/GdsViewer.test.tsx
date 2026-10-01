import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GdsViewer from "./GdsViewer";
import type { GdsRegionResult, GdsSummary } from "@/lib/api";

function realSummary(): GdsSummary {
  return {
    dbu_um: 0.001,
    top_cell_name: "m_doc_and_gate",
    cell_count: 7,
    bounding_box: { min_x_um: 0, min_y_um: 0, max_x_um: 300, max_y_um: 300 },
    layers: [
      { layer: 68, datatype: 20, known_name: "met1", shape_count: 45797 },
      { layer: 66, datatype: 20, known_name: "poly", shape_count: 1200 },
      { layer: 235, datatype: 4, known_name: null, shape_count: 1 },
    ],
    total_polygon_count: 102780,
    total_path_count: 45702,
    total_box_count: 575637,
    total_text_count: 111968,
    file_size_bytes: 2020856,
    parse_seconds: 2.2,
  };
}

function realRegion(layer: number, datatype: number): GdsRegionResult {
  return {
    layer,
    datatype,
    queried_region: { min_x_um: 0, min_y_um: 0, max_x_um: 300, max_y_um: 300 },
    shapes: [
      { kind: "box", points_um: [[5.52, 48.72], [294.4, 48.72], [294.4, 49.2], [5.52, 49.2]] },
    ],
    returned_count: 1,
    truncated: false,
  };
}

describe("GdsViewer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the real GDS summary arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    );

    render(<GdsViewer jobId="job-1" />);

    expect(screen.getByTestId("gds-viewer-loading")).toBeInTheDocument();
  });

  it("renders real summary metadata and the real layer list, never fake geometry before a layer is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => realSummary() });
    vi.stubGlobal("fetch", fetchMock);

    render(<GdsViewer jobId="job-1" />);

    await waitFor(() => expect(screen.getByTestId("gds-viewer")).toBeInTheDocument());
    expect(screen.getByText(/m_doc_and_gate/)).toBeInTheDocument();
    expect(screen.getByText(/575637 real boxes/)).toBeInTheDocument();
    expect(screen.getByText(/met1 \(L68\/D20\) \(45797\)/)).toBeInTheDocument();
    expect(screen.getByText(/L235\/D4 \(1\)/)).toBeInTheDocument(); // unknown layer falls back honestly, never a fabricated name

    // No region request should have been made yet - no layer selected.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(
    "fetches and displays real geometry only for a selected layer (debounced, real viewport query)",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => realSummary() })
        .mockResolvedValueOnce({ ok: true, json: async () => realRegion(68, 20) });
      vi.stubGlobal("fetch", fetchMock);

      render(<GdsViewer jobId="job-1" />);
      await waitFor(() => expect(screen.getByTestId("gds-viewer")).toBeInTheDocument());

      fireEvent.click(screen.getByText(/met1 \(L68\/D20\)/));

      await waitFor(
        () => {
          expect(fetchMock).toHaveBeenCalledTimes(2);
        },
        { timeout: 3000 }
      );

      const secondCallUrl = fetchMock.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain("/gds/region");
      expect(secondCallUrl).toContain("layer=68");
      expect(secondCallUrl).toContain("datatype=20");
    },
    10000
  );

  it("shows an honest error message when the real GDS summary request fails, never a fabricated empty viewer", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 409, text: async () => "job not succeeded" });
    vi.stubGlobal("fetch", fetchMock);

    render(<GdsViewer jobId="job-1" />);

    await waitFor(() => expect(screen.getByTestId("gds-viewer-error")).toBeInTheDocument());
    expect(screen.queryByTestId("gds-viewer")).not.toBeInTheDocument();
  });

  it(
    "shows an honest error message when a real geometry region request fails",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => realSummary() })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "parser crashed" });
      vi.stubGlobal("fetch", fetchMock);

      render(<GdsViewer jobId="job-1" />);
      await waitFor(() => expect(screen.getByTestId("gds-viewer")).toBeInTheDocument());

      fireEvent.click(screen.getByText(/met1 \(L68\/D20\)/));

      await waitFor(() => expect(screen.getByTestId("gds-viewer-region-error")).toBeInTheDocument(), { timeout: 3000 });
    },
    10000
  );

  it(
    "never lets a slow, stale region fetch overwrite a newer, faster one (regression for a real race condition)",
    async () => {
      // realSummary() already declares both "met1" and "poly" layers -
      // reused as-is here (no need to invent a duplicate).
      let resolveSlowFirstFetch: (value: unknown) => void = () => {};
      const slowFirstFetch = new Promise((resolve) => {
        resolveSlowFirstFetch = resolve;
      });
      let resolveFastSecondFetch: (value: unknown) => void = () => {};
      const fastSecondFetch = new Promise((resolve) => {
        resolveFastSecondFetch = resolve;
      });

      const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => realSummary() });
      vi.stubGlobal("fetch", fetchMock);

      render(<GdsViewer jobId="job-1" />);
      await waitFor(() => expect(screen.getByTestId("gds-viewer")).toBeInTheDocument());

      // Select met1 - triggers the FIRST (slow) region fetch once debounced.
      fetchMock.mockReturnValueOnce(slowFirstFetch);
      fireEvent.click(screen.getByRole("checkbox", { name: /met1/ }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 3000 });

      // Before it resolves, switch to poly instead (uncheck met1, check
      // poly) - triggers a SECOND (fast), independent single-layer
      // region fetch cycle (a fresh debounce window, since
      // visibleLayers changed to a DIFFERENT single layer).
      fireEvent.click(screen.getByRole("checkbox", { name: /met1/ }));
      fetchMock.mockReturnValueOnce(fastSecondFetch);
      fireEvent.click(screen.getByRole("checkbox", { name: /poly/ }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 3000 });

      // The two fixtures are distinguishable by their `truncated` flag,
      // so the test can tell WHICH one "won" purely from rendered text -
      // the fresh (poly) result is never truncated; the stale (met1)
      // result IS truncated. If the bug were present, the stale result
      // resolving last would incorrectly flip the "truncated" caption
      // back on.
      const freshResult: GdsRegionResult = { ...realRegion(66, 20), truncated: false };
      const staleResult: GdsRegionResult = { ...realRegion(68, 20), truncated: true };

      // The SECOND (newer) fetch resolves FIRST...
      resolveFastSecondFetch({ ok: true, json: async () => freshResult });
      await waitFor(() => expect(screen.queryByText(/Loading real geometry/)).not.toBeInTheDocument(), { timeout: 3000 });
      expect(screen.queryByText(/more real shapes in this view/)).not.toBeInTheDocument();

      // ...then the FIRST (now stale) fetch finally resolves too - it
      // must NOT be allowed to overwrite the newer, non-truncated result.
      resolveSlowFirstFetch({ ok: true, json: async () => staleResult });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(screen.queryByText(/more real shapes in this view/)).not.toBeInTheDocument();
    },
    10000
  );
});
