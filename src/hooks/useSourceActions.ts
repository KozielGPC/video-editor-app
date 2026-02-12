import { useCallback, useMemo } from "react";
import { useSceneStore, type Source } from "@/stores/sceneStore";

type NewSource = Omit<Source, "id" | "zIndex">;

interface UseSourceActionsResult {
  /** Add a source to the active scene */
  addSource: (source: NewSource) => string | null;
  /** Remove a source from the active scene */
  removeSource: (sourceId: string) => void;
  /** Update source properties */
  updateSource: (sourceId: string, updates: Partial<Source>) => void;
  /** Select a source (or null to deselect) */
  selectSource: (sourceId: string | null) => void;
  /** Move a source to a new position (x, y in percentages) */
  moveSource: (sourceId: string, x: number, y: number) => void;
  /** Resize a source (width, height in percentages, optionally with new position) */
  resizeSource: (sourceId: string, width: number, height: number, x?: number, y?: number) => void;
  /** Change source layer order */
  reorderSource: (
    sourceId: string,
    direction: "up" | "down" | "top" | "bottom",
  ) => void;
  /** Toggle source visibility */
  toggleVisibility: (sourceId: string) => void;
  /** Toggle source lock state */
  toggleLock: (sourceId: string) => void;
  /** Whether there's an active scene to operate on */
  hasActiveScene: boolean;
}

/**
 * Hook that provides bound actions for the active scene.
 * Simplifies component code by removing the need to pass sceneId to every action.
 */
export function useSourceActions(): UseSourceActionsResult {
  const activeSceneId = useSceneStore((state) => state.activeSceneId);

  // Access actions directly from the store - they are stable references
  const addSource = useCallback(
    (source: NewSource): string | null => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return null;
      return useSceneStore.getState().addSource(sceneId, source);
    },
    [],
  );

  const removeSource = useCallback(
    (sourceId: string) => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return;
      useSceneStore.getState().removeSource(sceneId, sourceId);
    },
    [],
  );

  const updateSource = useCallback(
    (sourceId: string, updates: Partial<Source>) => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return;
      useSceneStore.getState().updateSource(sceneId, sourceId, updates);
    },
    [],
  );

  const selectSource = useCallback(
    (sourceId: string | null) => {
      useSceneStore.getState().selectSource(sourceId);
    },
    [],
  );

  const moveSource = useCallback(
    (sourceId: string, x: number, y: number) => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return;
      useSceneStore.getState().moveSource(sceneId, sourceId, x, y);
    },
    [],
  );

  const resizeSource = useCallback(
    (sourceId: string, width: number, height: number, x?: number, y?: number) => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return;
      useSceneStore.getState().resizeSource(sceneId, sourceId, width, height, x, y);
    },
    [],
  );

  const reorderSource = useCallback(
    (sourceId: string, direction: "up" | "down" | "top" | "bottom") => {
      const sceneId = useSceneStore.getState().activeSceneId;
      if (!sceneId) return;
      useSceneStore.getState().reorderSource(sceneId, sourceId, direction);
    },
    [],
  );

  const toggleVisibility = useCallback(
    (sourceId: string) => {
      const state = useSceneStore.getState();
      const sceneId = state.activeSceneId;
      if (!sceneId) return;
      const scene = state.scenes.find((s) => s.id === sceneId);
      const source = scene?.sources.find((s) => s.id === sourceId);
      if (source) {
        state.updateSource(sceneId, sourceId, {
          visible: !source.visible,
        });
      }
    },
    [],
  );

  const toggleLock = useCallback(
    (sourceId: string) => {
      const state = useSceneStore.getState();
      const sceneId = state.activeSceneId;
      if (!sceneId) return;
      const scene = state.scenes.find((s) => s.id === sceneId);
      const source = scene?.sources.find((s) => s.id === sourceId);
      if (source) {
        state.updateSource(sceneId, sourceId, {
          locked: !source.locked,
        });
      }
    },
    [],
  );

  return useMemo(
    () => ({
      addSource,
      removeSource,
      updateSource,
      selectSource,
      moveSource,
      resizeSource,
      reorderSource,
      toggleVisibility,
      toggleLock,
      hasActiveScene: activeSceneId !== null,
    }),
    [
      addSource,
      removeSource,
      updateSource,
      selectSource,
      moveSource,
      resizeSource,
      reorderSource,
      toggleVisibility,
      toggleLock,
      activeSceneId,
    ],
  );
}

/**
 * Hook for scene-level actions (not bound to active scene).
 */
export function useSceneActions() {
  // Access actions directly - they are stable references
  const createScene = useCallback(
    (name: string) => useSceneStore.getState().createScene(name),
    [],
  );

  const deleteScene = useCallback(
    (sceneId: string) => useSceneStore.getState().deleteScene(sceneId),
    [],
  );

  const renameScene = useCallback(
    (sceneId: string, name: string) => useSceneStore.getState().renameScene(sceneId, name),
    [],
  );

  const setActiveScene = useCallback(
    (sceneId: string) => useSceneStore.getState().setActiveScene(sceneId),
    [],
  );

  const duplicateScene = useCallback(
    (sceneId: string) => useSceneStore.getState().duplicateScene(sceneId),
    [],
  );

  return useMemo(
    () => ({
      createScene,
      deleteScene,
      renameScene,
      setActiveScene,
      duplicateScene,
    }),
    [createScene, deleteScene, renameScene, setActiveScene, duplicateScene],
  );
}
