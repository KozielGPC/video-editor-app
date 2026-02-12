import { useMemo } from "react";
import { useSceneStore, type Scene, type Source } from "@/stores/sceneStore";

export interface UseActiveSceneResult {
  /** The currently active scene, or null if none */
  scene: Scene | null;
  /** Sources in the active scene, sorted by zIndex (ascending) */
  sources: Source[];
  /** The currently selected source in the active scene, or null */
  selectedSource: Source | null;
  /** Whether a scene is active */
  hasActiveScene: boolean;
  /** Number of sources in the active scene */
  sourceCount: number;
}

/**
 * Convenience hook that returns the active scene and its sources.
 * Uses memoized selectors for performance.
 */
export function useActiveScene(): UseActiveSceneResult {
  const scenes = useSceneStore((state) => state.scenes);
  const activeSceneId = useSceneStore((state) => state.activeSceneId);
  const selectedSourceId = useSceneStore((state) => state.selectedSourceId);

  const scene = useMemo(() => {
    return scenes.find((s) => s.id === activeSceneId) ?? null;
  }, [scenes, activeSceneId]);

  const sources = useMemo(() => {
    if (!scene) return [];
    // Sort by zIndex ascending (lower zIndex = further back)
    return [...scene.sources].sort((a, b) => a.zIndex - b.zIndex);
  }, [scene]);

  const selectedSource = useMemo(() => {
    if (!scene || !selectedSourceId) return null;
    return scene.sources.find((s) => s.id === selectedSourceId) ?? null;
  }, [scene, selectedSourceId]);

  return useMemo(
    () => ({
      scene,
      sources,
      selectedSource,
      hasActiveScene: scene !== null,
      sourceCount: sources.length,
    }),
    [scene, sources, selectedSource],
  );
}

/**
 * Hook to get just the active scene ID with minimal re-renders.
 */
export function useActiveSceneId(): string | null {
  return useSceneStore((state) => state.activeSceneId);
}

/**
 * Hook to get all scenes for scene switching UI.
 */
export function useScenes(): Scene[] {
  return useSceneStore((state) => state.scenes);
}
