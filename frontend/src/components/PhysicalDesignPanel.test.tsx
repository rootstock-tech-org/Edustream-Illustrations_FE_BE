import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PhysicalDesignPanel from "./PhysicalDesignPanel";
import type { PhysicalDesignJob } from "@/lib/api";

const CIRCUIT_DOCUMENT = { id: "doc_and_gate", name: "AND Gate" };

function queuedJob(): PhysicalDesignJob {
  return {
    job_id: "job-1",
    status: "queued",
    failure_code: null,
    failure_message: null,
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:00Z",
    result: null,
  };
}

function succeededJob(): PhysicalDesignJob {
  return {
    job_id: "job-1",
    status: "succeeded",
    failure_code: null,
    failure_message: null,
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:02:00Z",
    result: {
      is_valid: true,
      errors: [],
      signoff: { drc_passed: true, lvs_passed: true, antenna_passed: true, drc_error_count: 0, lvs_error_count: 0 },
      identity_mapping: {
        component_mappings: [{ canonical_component_id: "and1", physical_cell_names: ["and1/_0_"], note: null }],
        port_mappings: [{ canonical_component_id: "in_a", def_pin_name: "in_a" }],
        unmapped_cells: [],
        connection_identity_status: "unavailable",
        cell_placements: [
          {
            cell_name: "and1/_0_",
            cell_type: "sky130_fd_sc_hd__and2_2",
            x: 10.58,
            y: 146.88,
            orientation: "N",
            classification: "canonical",
            canonical_component_id: "and1",
          },
        ],
      },
      artifacts: [{ artifact_type: "def", file_name: "def/m_doc_and_gate.def", size_bytes: 2158762 }],
      metrics: {},
      die_width_um: 300,
      die_height_um: 300,
    },
  };
}

function designIdentityLedgerFixture() {
  return {
    document_id: "doc_and_gate",
    document_name: "AND Gate",
    hdl_module_name: "m_doc_and_gate",
    component_count: 4,
    mapped_component_count: 4,
    connection_identity_status: "unavailable",
    unmapped_physical_cell_count: 2,
    records: [
      {
        canonical_component_id: "and1",
        canonical_kind: "AND",
        canonical_name: "AND1",
        hdl_instance_name: "and1",
        physical_cell_names: ["and1/_0_"],
        def_pin_name: null,
        layers_present: ["logical", "hdl", "physical"],
        note: null,
      },
    ],
  };
}

function failedJob(): PhysicalDesignJob {
  return {
    job_id: "job-1",
    status: "failed",
    failure_code: "UNSUPPORTED_COMPONENT_KIND",
    failure_message: "This document cannot be synthesized yet.",
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:05Z",
    result: null,
  };
}

function runningJob(): PhysicalDesignJob {
  return {
    job_id: "job-1",
    status: "running",
    failure_code: null,
    failure_message: null,
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:01Z",
    result: null,
  };
}

function cancelledJob(): PhysicalDesignJob {
  return {
    job_id: "job-1",
    status: "cancelled",
    failure_code: "CANCELLED",
    failure_message: "Cancelled by user request.",
    created_at: "2026-09-14T00:00:00Z",
    updated_at: "2026-09-14T00:00:02Z",
    result: null,
  };
}

describe("PhysicalDesignPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Real timers deliberately used here (not vi.useFakeTimers()) - RTL's
  // own waitFor() relies on real timer ticks to retry, and deadlocks
  // when combined with a globally-faked clock. The component's real
  // 3-second poll interval is short enough to just wait for directly.
  it(
    "starts a build, polls, and renders the real succeeded result",
    async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => queuedJob() })
        .mockResolvedValueOnce({ ok: true, json: async () => succeededJob() });
      vi.stubGlobal("fetch", fetchMock);

      render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);

      fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

      await waitFor(() => expect(screen.getByText(/queued/i)).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText(/succeeded/i)).toBeInTheDocument(), { timeout: 8000 });

    expect(screen.getAllByText(/PASS.*0.*error/i)).toHaveLength(2); // DRC + LVS
    expect(screen.getByText("and1")).toBeInTheDocument();
    expect(screen.getByText(/and1\/_0_/)).toBeInTheDocument();
    expect(screen.getByTestId("physical-floorplan-svg")).toBeInTheDocument();
    expect(screen.getByTestId("floorplan-cell-and1/_0_")).toBeInTheDocument();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/physical-design/build"),
        expect.objectContaining({ method: "POST" })
      );
    },
    10000
  );

  it("shows an honest failure code/message for a real failed job, never a fabricated success", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => failedJob() });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.getByText(/failed/i)).toBeInTheDocument());
    expect(screen.getByText(/UNSUPPORTED_COMPONENT_KIND/)).toBeInTheDocument();
    expect(screen.queryByTestId("physical-floorplan-svg")).not.toBeInTheDocument();
  });

  it("shows a network error message when the build request itself fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 422, text: async () => "bad document" });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.getByText(/Error:/)).toBeInTheDocument());
  });

  it("never renders a floorplan or identity table before any build is started", () => {
    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);

    expect(screen.queryByTestId("physical-floorplan-svg")).not.toBeInTheDocument();
    expect(screen.queryByText(/Canonical identity mapping/)).not.toBeInTheDocument();
  });

  it("shows a Cancel button only while a job is queued/running, and cancelling shows the cancelled state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => runningJob() })
      .mockResolvedValueOnce({ ok: true, json: async () => cancelledJob() });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.getByText(/running/i)).toBeInTheDocument());
    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    expect(cancelButton).toBeInTheDocument();

    fireEvent.click(cancelButton);

    await waitFor(() => expect(screen.getAllByText(/cancelled/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/Cancelled by user request/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/physical-design/jobs/job-1/cancel"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("never shows a Cancel button before any build has started, or once a job is already terminal", () => {
    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("shows an honest error message if the cancel request itself fails, without fabricating a cancelled state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => runningJob() })
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => "already terminal" });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.getByText(/running/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.getByText(/Error:/)).toBeInTheDocument());
    expect(screen.getByText(/running/i)).toBeInTheDocument(); // status unchanged, never fabricated as cancelled
  });

  it("clears the previous job's result immediately on a new build - never shows a stale result as the new job's", async () => {
    // First build resolves immediately to a succeeded result.
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => succeededJob() });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));
    await waitFor(() => expect(screen.getByText(/succeeded/i)).toBeInTheDocument());
    expect(screen.getByTestId("physical-floorplan-svg")).toBeInTheDocument();

    // Second build's network request is deliberately left pending so we can
    // assert the OLD result is gone before the new one arrives.
    let resolveSecondBuild: (value: unknown) => void = () => {};
    const pendingSecondBuild = new Promise((resolve) => {
      resolveSecondBuild = resolve;
    });
    fetchMock.mockReturnValueOnce(pendingSecondBuild);

    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.queryByTestId("physical-floorplan-svg")).not.toBeInTheDocument());
    expect(screen.queryByText(/succeeded/i)).not.toBeInTheDocument();

    resolveSecondBuild({ ok: true, json: async () => queuedJob() });
    await waitFor(() => expect(screen.getByText(/queued/i)).toBeInTheDocument());
  });

  it("fetches and renders the canonical identity ledger once a job succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => succeededJob() })
      .mockResolvedValueOnce({ ok: true, json: async () => designIdentityLedgerFixture() });
    vi.stubGlobal("fetch", fetchMock);

    render(<PhysicalDesignPanel circuitDocument={CIRCUIT_DOCUMENT} />);
    fireEvent.click(screen.getByRole("button", { name: /build physical design/i }));

    await waitFor(() => expect(screen.getByText(/Canonical Identity Ledger/)).toBeInTheDocument());
    expect(screen.getByText("m_doc_and_gate")).toBeInTheDocument();
    expect(screen.getByText("Logical -> HDL -> Physical")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/identity"));
  });
});
