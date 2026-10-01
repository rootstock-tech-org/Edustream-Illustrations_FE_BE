"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Step 17: the single shared source of truth for cross-view selection.
 * Every view (3D, schematic, and any future view) reads/writes selection
 * ONLY through this context, keyed exclusively by the canonical IR ids
 * (source_component_id / source_port_id / source_connection_id) - never
 * by any view-generated id (e.g. SceneObject.id, SchematicComponent.id).
 * Mutually exclusive: selecting one of component/port/connection clears
 * the other two, so exactly one "currently selected thing" exists at a
 * time, matching the target architecture's single GLOBAL SELECTION box. */
export interface SelectionState {
  selectedComponentId: string | null;
  selectedPortId: string | null;
  selectedConnectionId: string | null;
}

export interface SelectionActions {
  selectComponent: (id: string) => void;
  selectPort: (id: string) => void;
  selectConnection: (id: string) => void;
  clearSelection: () => void;
}

export type SelectionContextValue = SelectionState & SelectionActions;

const EMPTY_SELECTION: SelectionState = {
  selectedComponentId: null,
  selectedPortId: null,
  selectedConnectionId: null,
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);

  const selectComponent = useCallback((id: string) => {
    setSelection({ selectedComponentId: id, selectedPortId: null, selectedConnectionId: null });
  }, []);

  const selectPort = useCallback((id: string) => {
    setSelection({ selectedComponentId: null, selectedPortId: id, selectedConnectionId: null });
  }, []);

  const selectConnection = useCallback((id: string) => {
    setSelection({ selectedComponentId: null, selectedPortId: null, selectedConnectionId: id });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
  }, []);

  const value = useMemo<SelectionContextValue>(
    () => ({ ...selection, selectComponent, selectPort, selectConnection, clearSelection }),
    [selection, selectComponent, selectPort, selectConnection, clearSelection],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (context === null) {
    throw new Error("useSelection() must be called within a <SelectionProvider>.");
  }
  return context;
}
