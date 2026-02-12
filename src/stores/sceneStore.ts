import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

/* ── Types ─────────────────────────────────────────────────────── */

export interface Source {
  id: string;
  type: "window" | "screen" | "camera" | "image" | "text";
  /** Native ID for window/screen, device ID for camera, path for image, content for text */
  sourceId: number | string;
  name: string;
  /** Layout (percentages 0-100) */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  /** Source-specific: thumbnail preview URL */
  thumbnail?: string;
  /** Original aspect ratio for maintaining proportions */
  aspectRatio?: number;
}

export interface Scene {
  id: string;
  name: string;
  sources: Source[];
}

export type AspectRatioPreset = "16:9" | "9:16" | "4:3" | "1:1" | "custom";

export interface CanvasSettings {
  aspectRatio: AspectRatioPreset;
  customWidth?: number;
  customHeight?: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapToEdges: boolean;
  gridSize: number; // percentage
}

const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
  aspectRatio: "16:9",
  showGrid: false,
  snapToGrid: true,
  snapToEdges: true,
  gridSize: 10,
};

/* ── State shape ──────────────────────────────────────────────── */

interface SceneState {
  scenes: Scene[];
  activeSceneId: string | null;
  selectedSourceId: string | null;
  canvasSettings: CanvasSettings;

  /* Scene actions */
  createScene: (name: string) => string;
  deleteScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  setActiveScene: (sceneId: string) => void;
  duplicateScene: (sceneId: string) => string | null;

  /* Source actions */
  addSource: (
    sceneId: string,
    source: Omit<Source, "id" | "zIndex">,
  ) => string;
  removeSource: (sceneId: string, sourceId: string) => void;
  updateSource: (
    sceneId: string,
    sourceId: string,
    updates: Partial<Source>,
  ) => void;
  selectSource: (sourceId: string | null) => void;

  /* Layout actions */
  moveSource: (sceneId: string, sourceId: string, x: number, y: number) => void;
  resizeSource: (
    sceneId: string,
    sourceId: string,
    width: number,
    height: number,
    x?: number,
    y?: number,
  ) => void;
  reorderSource: (
    sceneId: string,
    sourceId: string,
    direction: "up" | "down" | "top" | "bottom",
  ) => void;

  /* Canvas settings */
  setAspectRatio: (ratio: AspectRatioPreset) => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  setSnapToEdges: (snap: boolean) => void;

  /* Helpers */
  getActiveScene: () => Scene | null;
  getSelectedSource: () => Source | null;
}

/* ── Helper: compute next zIndex for a scene ───────────────────── */

function getNextZIndex(sources: Source[]): number {
  if (sources.length === 0) return 0;
  return Math.max(...sources.map((s) => s.zIndex)) + 1;
}

/* ── Helper: reorder zIndex values ─────────────────────────────── */

function reorderZIndex(
  sources: Source[],
  sourceId: string,
  direction: "up" | "down" | "top" | "bottom",
): Source[] {
  const sorted = [...sources].sort((a, b) => a.zIndex - b.zIndex);
  const index = sorted.findIndex((s) => s.id === sourceId);

  if (index === -1) return sources;

  let newIndex: number;
  switch (direction) {
    case "up":
      newIndex = Math.min(index + 1, sorted.length - 1);
      break;
    case "down":
      newIndex = Math.max(index - 1, 0);
      break;
    case "top":
      newIndex = sorted.length - 1;
      break;
    case "bottom":
      newIndex = 0;
      break;
  }

  if (newIndex === index) return sources;

  // Remove and reinsert at new position
  const [removed] = sorted.splice(index, 1);
  sorted.splice(newIndex, 0, removed);

  // Reassign zIndex based on new order
  return sorted.map((s, i) => ({ ...s, zIndex: i }));
}

/* ── Default scene name ─────────────────────────────────────────── */

const DEFAULT_SCENE_NAME = "Scene 1";

/* ── Store ─────────────────────────────────────────────────────── */

export const useSceneStore = create<SceneState>()(
  devtools(
    persist(
      (set, get) => ({
        scenes: [],
        activeSceneId: null,
        selectedSourceId: null,
        canvasSettings: DEFAULT_CANVAS_SETTINGS,

        /* ────────── Scene Actions ────────── */

        createScene: (name) => {
          const id = uuidv4();
          const newScene: Scene = { id, name, sources: [] };

          set(
            (state) => ({
              scenes: [...state.scenes, newScene],
              activeSceneId: state.activeSceneId ?? id,
            }),
            false,
            "createScene",
          );

          return id;
        },

        deleteScene: (sceneId) => {
          set(
            (state) => {
              const newScenes = state.scenes.filter((s) => s.id !== sceneId);
              let newActiveId = state.activeSceneId;

              // If we deleted the active scene, pick another
              if (state.activeSceneId === sceneId) {
                newActiveId = newScenes.length > 0 ? newScenes[0].id : null;
              }

              // Clear selected source if it was in the deleted scene
              const deletedScene = state.scenes.find((s) => s.id === sceneId);
              const selectedInDeleted = deletedScene?.sources.some(
                (src) => src.id === state.selectedSourceId,
              );

              return {
                scenes: newScenes,
                activeSceneId: newActiveId,
                selectedSourceId: selectedInDeleted
                  ? null
                  : state.selectedSourceId,
              };
            },
            false,
            "deleteScene",
          );
        },

        renameScene: (sceneId, name) => {
          set(
            (state) => ({
              scenes: state.scenes.map((s) =>
                s.id === sceneId ? { ...s, name } : s,
              ),
            }),
            false,
            "renameScene",
          );
        },

        setActiveScene: (sceneId) => {
          set({ activeSceneId: sceneId, selectedSourceId: null }, false, "setActiveScene");
        },

        duplicateScene: (sceneId) => {
          const state = get();
          const scene = state.scenes.find((s) => s.id === sceneId);
          if (!scene) return null;

          const newId = uuidv4();
          const newScene: Scene = {
            id: newId,
            name: `${scene.name} (Copy)`,
            sources: scene.sources.map((src) => ({
              ...src,
              id: uuidv4(),
            })),
          };

          set(
            (state) => ({
              scenes: [...state.scenes, newScene],
            }),
            false,
            "duplicateScene",
          );

          return newId;
        },

        /* ────────── Source Actions ────────── */

        addSource: (sceneId, source) => {
          const id = uuidv4();

          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                const zIndex = getNextZIndex(scene.sources);
                const newSource: Source = { ...source, id, zIndex };

                return {
                  ...scene,
                  sources: [...scene.sources, newSource],
                };
              }),
            }),
            false,
            "addSource",
          );

          return id;
        },

        removeSource: (sceneId, sourceId) => {
          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                return {
                  ...scene,
                  sources: scene.sources.filter((s) => s.id !== sourceId),
                };
              }),
              selectedSourceId:
                state.selectedSourceId === sourceId
                  ? null
                  : state.selectedSourceId,
            }),
            false,
            "removeSource",
          );
        },

        updateSource: (sceneId, sourceId, updates) => {
          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                return {
                  ...scene,
                  sources: scene.sources.map((s) =>
                    s.id === sourceId ? { ...s, ...updates } : s,
                  ),
                };
              }),
            }),
            false,
            "updateSource",
          );
        },

        selectSource: (sourceId) => {
          set({ selectedSourceId: sourceId }, false, "selectSource");
        },

        /* ────────── Layout Actions ────────── */

        moveSource: (sceneId, sourceId, x, y) => {
          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                return {
                  ...scene,
                  sources: scene.sources.map((s) =>
                    s.id === sourceId ? { ...s, x, y } : s,
                  ),
                };
              }),
            }),
            false,
            "moveSource",
          );
        },

        resizeSource: (sceneId, sourceId, width, height, x?, y?) => {
          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                return {
                  ...scene,
                  sources: scene.sources.map((s) => {
                    if (s.id !== sourceId) return s;
                    return {
                      ...s,
                      width,
                      height,
                      ...(x !== undefined && { x }),
                      ...(y !== undefined && { y }),
                    };
                  }),
                };
              }),
            }),
            false,
            "resizeSource",
          );
        },

        reorderSource: (sceneId, sourceId, direction) => {
          set(
            (state) => ({
              scenes: state.scenes.map((scene) => {
                if (scene.id !== sceneId) return scene;

                return {
                  ...scene,
                  sources: reorderZIndex(scene.sources, sourceId, direction),
                };
              }),
            }),
            false,
            "reorderSource",
          );
        },

        /* ────────── Canvas Settings ────────── */

        setAspectRatio: (ratio) => {
          set(
            (state) => ({
              canvasSettings: { ...state.canvasSettings, aspectRatio: ratio },
            }),
            false,
            "setAspectRatio",
          );
        },

        toggleGrid: () => {
          set(
            (state) => ({
              canvasSettings: {
                ...state.canvasSettings,
                showGrid: !state.canvasSettings.showGrid,
              },
            }),
            false,
            "toggleGrid",
          );
        },

        setGridSize: (size) => {
          set(
            (state) => ({
              canvasSettings: { ...state.canvasSettings, gridSize: size },
            }),
            false,
            "setGridSize",
          );
        },

        setSnapToEdges: (snap) => {
          set(
            (state) => ({
              canvasSettings: { ...state.canvasSettings, snapToEdges: snap },
            }),
            false,
            "setSnapToEdges",
          );
        },

        /* ────────── Helpers ────────── */

        getActiveScene: () => {
          const state = get();
          return state.scenes.find((s) => s.id === state.activeSceneId) ?? null;
        },

        getSelectedSource: () => {
          const state = get();
          const activeScene = state.scenes.find(
            (s) => s.id === state.activeSceneId,
          );
          if (!activeScene) return null;

          return (
            activeScene.sources.find(
              (s) => s.id === state.selectedSourceId,
            ) ?? null
          );
        },
      }),
      {
        name: "autoeditor-scenes",
        // On rehydrate, ensure we have at least one scene
        onRehydrateStorage: () => (state) => {
          if (state && state.scenes.length === 0) {
            const id = uuidv4();
            state.scenes = [{ id, name: DEFAULT_SCENE_NAME, sources: [] }];
            state.activeSceneId = id;
          }
        },
      },
    ),
    { name: "SceneStore" },
  ),
);

/* ── Initialize default scene on first load ─────────────────────── */

// Check if store is empty after hydration and create default scene
const initializeDefaultScene = () => {
  const state = useSceneStore.getState();
  if (state.scenes.length === 0) {
    state.createScene(DEFAULT_SCENE_NAME);
  }
};

// Run initialization after store is ready
if (typeof window !== "undefined") {
  // Wait for persist middleware to rehydrate
  useSceneStore.persist.onFinishHydration(initializeDefaultScene);
}
