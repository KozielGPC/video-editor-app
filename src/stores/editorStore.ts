import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import type { Project, Track, Clip, Effect, Overlay, Asset, CameraOverlayInfo } from "@/types/project";
import { ZOOM_ASSET_ID } from "@/types/project";
import type { Segment } from "@/lib/ffmpeg";
import { getPresetById } from "@/lib/scenePresets";
import { makeRelativePath, resolveAssetPath } from "@/lib/paths";

// ─── Public Types ────────────────────────────────────────────────────────────

export type Tool = "select" | "cut" | "text" | "zoom";
/** @deprecated Use `Tool` instead */
export type EditorTool = Tool;

// ─── State Shape ─────────────────────────────────────────────────────────────

interface EditorState {
  /* core state */
  project: Project | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  playheadPosition: number;
  isPlaying: boolean;
  timelineZoom: number; // pixels per second
  tool: Tool;

  /* project persistence */
  projectDir: string | null;
  isDirty: boolean;

  /* undo / redo (internal stacks) */
  _undoStack: Project[];
  _redoStack: Project[];

  /* project */
  setProject: (project: Project | null) => void;
  createNewProject: (name: string, width?: number, height?: number, fps?: number) => void;
  /** Create a project from a recording file and auto-add it as a clip */
  createProjectFromRecording: (
    filePath: string,
    durationSec?: number,
    zoomEffects?: Effect[],
    cameraOverlay?: CameraOverlayInfo,
    projectDir?: string,
  ) => void;

  /* persistence */
  setProjectDir: (dir: string | null) => void;
  markDirty: () => void;
  markClean: () => void;
  saveProject: () => Promise<void>;
  loadProject: (dirPath: string) => Promise<void>;

  /* tracks */
  addTrack: (type: Track["type"]) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;

  /* clips */
  addClip: (trackId: string, clip: Clip) => void;
  removeClip: (trackId: string, clipId: string) => void;
  updateClip: (
    trackId: string,
    clipId: string,
    updates: Partial<Clip>,
  ) => void;
  splitClipAtPlayhead: () => void;
  moveClip: (
    fromTrackId: string,
    clipId: string,
    toTrackId: string,
    newPosition: number,
  ) => void;
  duplicateClip: (trackId: string, clipId: string) => void;

  /* effects & overlays */
  addEffect: (trackId: string, clipId: string, effect: Effect) => void;
  addEffects: (trackId: string, clipId: string, effects: Effect[]) => void;
  updateEffect: (
    trackId: string,
    clipId: string,
    effectIndex: number,
    patch: Partial<Effect>,
  ) => void;
  removeEffect: (
    trackId: string,
    clipId: string,
    effectIndex: number,
  ) => void;
  addOverlay: (trackId: string, clipId: string, overlay: Overlay) => void;
  removeOverlay: (
    trackId: string,
    clipId: string,
    overlayIndex: number,
  ) => void;

  /* selection */
  selectClip: (clipId: string | null, trackId?: string | null) => void;
  selectTrack: (trackId: string | null) => void;

  /* playback */
  setPlayheadPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;

  /* timeline */
  setTimelineZoom: (zoom: number) => void;
  setTool: (tool: Tool) => void;

  /* silence removal */
  applySilenceRemoval: (segments: Segment[]) => void;

  /* zoom track */
  addZoomClip: (
    trackPosition: number,
    duration: number,
    params: { x: number; y: number; scale: number; easing?: string; rampIn?: number; rampOut?: number },
  ) => void;
  getZoomTrack: () => Track | null;
  ensureZoomTrack: () => void;

  /* scene presets */
  applyScenePreset: (presetId: string) => void;

  /* history */
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

// ─── Store ───────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set, get) => ({
  // ── Initial state ────────────────────────────────────────────────────────

  project: null,
  selectedClipId: null,
  selectedTrackId: null,
  playheadPosition: 0,
  isPlaying: false,
  timelineZoom: 100,
  tool: "select",
  projectDir: null,
  isDirty: false,
  _undoStack: [],
  _redoStack: [],

  // ── History helpers ──────────────────────────────────────────────────────

  _pushHistory: () => {
    const { project, _undoStack } = get();
    if (!project) return;
    const snapshot = structuredClone(project);
    const stack = [..._undoStack, snapshot];
    if (stack.length > MAX_HISTORY) stack.shift();
    set({ _undoStack: stack, _redoStack: [], isDirty: true });
  },

  undo: () => {
    const { _undoStack, project, _redoStack } = get();
    if (_undoStack.length === 0 || !project) return;
    const stack = [..._undoStack];
    const previous = stack.pop()!;
    set({
      project: previous,
      _undoStack: stack,
      _redoStack: [..._redoStack, structuredClone(project)],
    });
  },

  redo: () => {
    const { _redoStack, project, _undoStack } = get();
    if (_redoStack.length === 0 || !project) return;
    const stack = [..._redoStack];
    const next = stack.pop()!;
    set({
      project: next,
      _redoStack: stack,
      _undoStack: [..._undoStack, structuredClone(project)],
    });
  },

  // ── Project ──────────────────────────────────────────────────────────────

  setProject: (project) => {
    if (project) {
      // Auto-migrate: ensure zoom track exists
      if (!project.tracks.some((t) => t.type === "zoom")) {
        project = {
          ...project,
          tracks: [
            ...project.tracks,
            { id: uuidv4(), name: "Zoom", type: "zoom", clips: [], muted: false, locked: false },
          ],
        };
      }

      // Migrate embedded zoom effects from video clips to zoom track
      const zoomTrack = project.tracks.find((t) => t.type === "zoom")!;
      const migratedClips: Clip[] = [];
      const updatedTracks = project.tracks.map((track) => {
        if (track.type !== "video") return track;
        return {
          ...track,
          clips: track.clips.map((clip) => {
            const zoomEffects = clip.effects.filter((e) => e.type === "zoom");
            if (zoomEffects.length === 0) return clip;

            // Create zoom clips on the zoom track
            for (const e of zoomEffects) {
              migratedClips.push({
                id: uuidv4(),
                assetId: ZOOM_ASSET_ID,
                trackPosition: clip.trackPosition + e.startTime,
                sourceStart: 0,
                sourceEnd: e.duration,
                volume: 1,
                effects: [{
                  type: "zoom",
                  startTime: 0,
                  duration: e.duration,
                  params: { ...e.params },
                }],
                overlays: [],
              });
            }

            // Remove zoom effects from the video clip
            return {
              ...clip,
              effects: clip.effects.filter((e) => e.type !== "zoom"),
            };
          }),
        };
      });

      if (migratedClips.length > 0) {
        project = {
          ...project,
          tracks: updatedTracks.map((t) =>
            t.id === zoomTrack.id
              ? { ...t, clips: [...t.clips, ...migratedClips] }
              : t,
          ),
        };
      }
    }

    set({
      project,
      selectedClipId: null,
      selectedTrackId: null,
      playheadPosition: 0,
      isPlaying: false,
      _undoStack: [],
      _redoStack: [],
      projectDir: null,
      isDirty: false,
    });
  },

  createNewProject: (name, width = 1920, height = 1080, fps = 30) => {
    const project: Project = {
      id: uuidv4(),
      name,
      resolution: { width, height },
      frameRate: fps,
      tracks: [
        { id: uuidv4(), type: "video", clips: [], muted: false, locked: false },
        { id: uuidv4(), type: "audio", clips: [], muted: false, locked: false },
        { id: uuidv4(), name: "Zoom", type: "zoom", clips: [], muted: false, locked: false },
      ],
      assets: [],
    };
    set({
      project,
      selectedClipId: null,
      selectedTrackId: null,
      playheadPosition: 0,
      isPlaying: false,
      _undoStack: [],
      _redoStack: [],
      projectDir: null,
      isDirty: false,
    });
  },

  createProjectFromRecording: (filePath, durationSec = 10, zoomEffects = [], cameraOverlay, projectDir) => {
    const assetId = uuidv4();
    const fileName = filePath.split("/").pop() ?? "Recording";
    const dirName = projectDir?.split("/").pop();
    const projectName = dirName ?? fileName.replace(/\.[^.]+$/, "");

    const asset: Asset = {
      id: assetId,
      name: fileName,
      path: filePath,
      type: "video",
      duration: durationSec,
      width: 1920,
      height: 1080,
    };

    const videoTrackId = uuidv4();
    const audioTrackId = uuidv4();
    const zoomTrackId = uuidv4();

    // Migrate zoom effects to zoom track clips
    const zoomClips: Clip[] = zoomEffects
      .filter((e) => e.type === "zoom")
      .map((e) => ({
        id: uuidv4(),
        assetId: ZOOM_ASSET_ID,
        trackPosition: e.startTime,
        sourceStart: 0,
        sourceEnd: e.duration,
        volume: 1,
        effects: [{
          type: "zoom" as const,
          startTime: 0,
          duration: e.duration,
          params: { ...e.params },
        }],
        overlays: [],
      }));

    // Keep only non-zoom effects on the video clip
    const nonZoomEffects = zoomEffects.filter((e) => e.type !== "zoom");

    const videoClip: Clip = {
      id: uuidv4(),
      assetId,
      trackPosition: 0,
      sourceStart: 0,
      sourceEnd: durationSec,
      volume: 1,
      effects: nonZoomEffects,
      overlays: [],
    };

    const audioClip: Clip = {
      id: uuidv4(),
      assetId,
      trackPosition: 0,
      sourceStart: 0,
      sourceEnd: durationSec,
      volume: 1,
      effects: [],
      overlays: [],
    };

    const project: Project = {
      id: uuidv4(),
      name: projectName,
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      tracks: [
        {
          id: videoTrackId,
          name: "Video 1",
          type: "video",
          clips: [videoClip],
          muted: false,
          locked: false,
        },
        {
          id: audioTrackId,
          name: "Audio 1",
          type: "audio",
          clips: [audioClip],
          muted: false,
          locked: false,
        },
        {
          id: zoomTrackId,
          name: "Zoom",
          type: "zoom",
          clips: zoomClips,
          muted: false,
          locked: false,
        },
      ],
      assets: [asset],
      cameraOverlay,
    };

    set({
      project,
      selectedClipId: null,
      selectedTrackId: null,
      playheadPosition: 0,
      isPlaying: false,
      _undoStack: [],
      _redoStack: [],
      projectDir: projectDir ?? null,
      isDirty: false,
    });
  },

  // ── Persistence ──────────────────────────────────────────────────────────

  setProjectDir: (dir) => set({ projectDir: dir }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),

  saveProject: async () => {
    const { project, projectDir } = get();
    if (!project || !projectDir) return;

    const savePath = `${projectDir}/project.autoeditor`;

    // Build Rust-compatible project data with AssetData
    const rustAssets = project.assets.map((a) => ({
      id: a.id,
      name: a.name,
      path: a.path,
      asset_type: a.type,
      duration_ms: Math.round(a.duration * 1000),
      width: a.width ?? 0,
      height: a.height ?? 0,
    }));

    const rustTracks = project.tracks.map((track) => ({
      id: track.id,
      track_type: track.type,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        asset_id: clip.assetId,
        track_position: Math.round(clip.trackPosition * 1000),
        source_start: Math.round(clip.sourceStart * 1000),
        source_end: Math.round(clip.sourceEnd * 1000),
        volume: clip.volume,
        effects: clip.effects.map((e) => ({
          effect_type: e.type,
          start_time: Math.round(e.startTime * 1000),
          duration: Math.round(e.duration * 1000),
          params: e.params,
        })),
        overlays: clip.overlays.map((o) => ({
          overlay_type: o.type,
          x: o.position.x,
          y: o.position.y,
          width: o.size.width,
          height: o.size.height,
          content: o.content,
          start_time: Math.round(o.startTime * 1000),
          duration: Math.round(o.duration * 1000),
        })),
      })),
      muted: track.muted,
      locked: track.locked,
    }));

    const cam = project.cameraOverlay;
    const cameraOverlay = cam
      ? {
          path: cam.path,
          sync_offset: cam.syncOffset,
          x: cam.x,
          y: cam.y,
          width: cam.width,
          height: cam.height,
          shape: cam.shape,
          border_radius: cam.borderRadius,
          border_width: cam.borderWidth,
          border_color: cam.borderColor,
          shadow: cam.shadow,
          crop_x: cam.cropX,
          crop_y: cam.cropY,
          crop_width: cam.cropWidth,
          crop_height: cam.cropHeight,
        }
      : undefined;

    const rustProject = {
      id: project.id,
      name: project.name,
      resolution: [project.resolution.width, project.resolution.height] as [number, number],
      frame_rate: project.frameRate,
      tracks: rustTracks,
      assets: rustAssets,
      camera_overlay: cameraOverlay,
      version: 1,
    };

    try {
      await invoke("save_project", {
        project: rustProject,
        path: savePath,
        projectDir,
      });
      set({ isDirty: false });
      console.debug("[editor] Project saved to", savePath);
    } catch (err) {
      console.error("Failed to save project:", err);
    }
  },

  loadProject: async (dirPath: string) => {
    const projectFile = `${dirPath}/project.autoeditor`;

    try {
      const rustProject = await invoke<{
        id: string;
        name: string;
        resolution: [number, number];
        frame_rate: number;
        tracks: Array<{
          id: string;
          track_type: string;
          clips: Array<{
            id: string;
            asset_id: string;
            track_position: number;
            source_start: number;
            source_end: number;
            volume: number;
            effects: Array<{
              effect_type: string;
              start_time: number;
              duration: number;
              params: Record<string, unknown>;
            }>;
            overlays: Array<{
              overlay_type: string;
              x: number;
              y: number;
              width: number;
              height: number;
              content: string;
              start_time: number;
              duration: number;
            }>;
          }>;
          muted: boolean;
          locked: boolean;
        }>;
        assets: Array<{
          id: string;
          name: string;
          path: string;
          asset_type: string;
          duration_ms: number;
          width: number;
          height: number;
        }>;
        camera_overlay?: {
          path: string;
          sync_offset: number;
          x: number;
          y: number;
          width: number;
          height: number;
          shape?: string;
          border_radius?: number;
          border_width?: number;
          border_color?: string;
          shadow?: boolean;
          crop_x?: number;
          crop_y?: number;
          crop_width?: number;
          crop_height?: number;
        };
        version: number;
      }>("load_project", { path: projectFile, projectDir: dirPath });

      // Convert Rust types back to frontend types
      const assets: Asset[] = rustProject.assets.map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
        type: a.asset_type as "video" | "audio" | "image",
        duration: a.duration_ms / 1000,
        width: a.width,
        height: a.height,
      }));

      const tracks: Track[] = rustProject.tracks.map((t) => ({
        id: t.id,
        type: t.track_type as Track["type"],
        clips: t.clips.map((c) => ({
          id: c.id,
          assetId: c.asset_id,
          trackPosition: c.track_position / 1000,
          sourceStart: c.source_start / 1000,
          sourceEnd: c.source_end / 1000,
          volume: c.volume,
          effects: c.effects.map((e) => ({
            type: e.effect_type as Effect["type"],
            startTime: e.start_time / 1000,
            duration: e.duration / 1000,
            params: e.params as Record<string, number | string>,
          })),
          overlays: c.overlays.map((o) => ({
            type: o.overlay_type as Overlay["type"],
            position: { x: o.x, y: o.y },
            size: { width: o.width, height: o.height },
            content: o.content,
            startTime: o.start_time / 1000,
            duration: o.duration / 1000,
          })),
        })),
        muted: t.muted,
        locked: t.locked,
      }));

      const cam = rustProject.camera_overlay;
      const cameraOverlay: CameraOverlayInfo | undefined = cam
        ? {
            path: cam.path,
            syncOffset: cam.sync_offset,
            x: cam.x,
            y: cam.y,
            width: cam.width,
            height: cam.height,
            shape: cam.shape,
            borderRadius: cam.border_radius,
            borderWidth: cam.border_width,
            borderColor: cam.border_color,
            shadow: cam.shadow,
            cropX: cam.crop_x,
            cropY: cam.crop_y,
            cropWidth: cam.crop_width,
            cropHeight: cam.crop_height,
          }
        : undefined;

      const project: Project = {
        id: rustProject.id,
        name: rustProject.name,
        resolution: {
          width: rustProject.resolution[0],
          height: rustProject.resolution[1],
        },
        frameRate: rustProject.frame_rate,
        tracks,
        assets,
        cameraOverlay,
      };

      // Use setProject which handles zoom track migration
      get().setProject(project);
      set({ projectDir: dirPath, isDirty: false });
      console.debug("[editor] Project loaded from", projectFile);
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  },

  // ── Tracks ───────────────────────────────────────────────────────────────

  addTrack: (type) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    const count = project.tracks.filter((t) => t.type === type).length;
    const newTrack: Track = {
      id: uuidv4(),
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count + 1}`,
      type,
      clips: [],
      muted: false,
      locked: false,
    };
    set({ project: { ...project, tracks: [...project.tracks, newTrack] } });
  },

  removeTrack: (trackId) => {
    const { project, _pushHistory, selectedTrackId, selectedClipId } = get();
    if (!project) return;
    _pushHistory();
    const track = project.tracks.find((t) => t.id === trackId);
    const clipIds = new Set(track?.clips.map((c) => c.id) ?? []);
    set({
      project: {
        ...project,
        tracks: project.tracks.filter((t) => t.id !== trackId),
      },
      selectedTrackId: selectedTrackId === trackId ? null : selectedTrackId,
      selectedClipId:
        selectedClipId && clipIds.has(selectedClipId)
          ? null
          : selectedClipId,
    });
  },

  toggleTrackMute: (trackId) => {
    const { project } = get();
    if (!project) return;
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, muted: !t.muted } : t,
        ),
      },
    });
  },

  toggleTrackLock: (trackId) => {
    const { project } = get();
    if (!project) return;
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, locked: !t.locked } : t,
        ),
      },
    });
  },

  // ── Clips ────────────────────────────────────────────────────────────────

  addClip: (trackId, clip) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t,
        ),
      },
    });
  },

  removeClip: (trackId, clipId) => {
    const { project, _pushHistory, selectedClipId } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
            : t,
        ),
      },
      selectedClipId: selectedClipId === clipId ? null : selectedClipId,
    });
  },

  updateClip: (trackId, clipId, updates) => {
    const { project } = get();
    if (!project) return;
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId ? { ...c, ...updates } : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  splitClipAtPlayhead: () => {
    const {
      project,
      selectedClipId,
      selectedTrackId,
      playheadPosition,
      _pushHistory,
    } = get();
    if (!project || !selectedClipId || !selectedTrackId) return;

    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) return;
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;

    const clipDuration = clip.sourceEnd - clip.sourceStart;
    const clipEnd = clip.trackPosition + clipDuration;
    if (playheadPosition <= clip.trackPosition || playheadPosition >= clipEnd)
      return;

    _pushHistory();

    const splitOffset = playheadPosition - clip.trackPosition;

    const clipA: Clip = {
      ...clip,
      sourceEnd: clip.sourceStart + splitOffset,
      effects: clip.effects.map((e) => ({ ...e })),
      overlays: clip.overlays.map((o) => ({ ...o })),
    };

    const clipB: Clip = {
      ...clip,
      id: uuidv4(),
      trackPosition: playheadPosition,
      sourceStart: clip.sourceStart + splitOffset,
      effects: clip.effects.map((e) => ({ ...e })),
      overlays: clip.overlays.map((o) => ({ ...o })),
    };

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === selectedTrackId
            ? {
                ...t,
                clips: [
                  ...t.clips.filter((c) => c.id !== clip.id),
                  clipA,
                  clipB,
                ],
              }
            : t,
        ),
      },
    });
  },

  moveClip: (fromTrackId, clipId, toTrackId, newPosition) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();

    let movedClip: Clip | undefined;
    const withRemoved = project.tracks.map((t) => {
      if (t.id === fromTrackId) {
        movedClip = t.clips.find((c) => c.id === clipId);
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      return t;
    });
    if (!movedClip) return;

    const withAdded = withRemoved.map((t) => {
      if (t.id === toTrackId) {
        return {
          ...t,
          clips: [
            ...t.clips,
            { ...movedClip!, trackPosition: Math.max(0, newPosition) },
          ],
        };
      }
      return t;
    });

    set({ project: { ...project, tracks: withAdded } });
  },

  duplicateClip: (trackId, clipId) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const clip = track.clips.find((c) => c.id === clipId);
    if (!clip) return;

    _pushHistory();

    const duration = clip.sourceEnd - clip.sourceStart;
    const newClip: Clip = {
      ...clip,
      id: uuidv4(),
      trackPosition: clip.trackPosition + duration,
      effects: clip.effects.map((e) => ({ ...e })),
      overlays: clip.overlays.map((o) => ({ ...o })),
    };

    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        ),
      },
    });
  },

  // ── Effects & Overlays ───────────────────────────────────────────────────

  addEffect: (trackId, clipId, effect) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? { ...c, effects: [...c.effects, effect] }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  addEffects: (trackId, clipId, effects) => {
    const { project, _pushHistory } = get();
    if (!project || effects.length === 0) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? { ...c, effects: [...c.effects, ...effects] }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  updateEffect: (trackId, clipId, effectIndex, patch) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        effects: c.effects.map((e, i) =>
                          i === effectIndex
                            ? {
                                ...e,
                                ...patch,
                                params: { ...e.params, ...patch.params },
                              }
                            : e,
                        ),
                      }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  removeEffect: (trackId, clipId, effectIndex) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        effects: c.effects.filter(
                          (_, i) => i !== effectIndex,
                        ),
                      }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  addOverlay: (trackId, clipId, overlay) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? { ...c, overlays: [...c.overlays, overlay] }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  removeOverlay: (trackId, clipId, overlayIndex) => {
    const { project, _pushHistory } = get();
    if (!project) return;
    _pushHistory();
    set({
      project: {
        ...project,
        tracks: project.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                clips: t.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        overlays: c.overlays.filter(
                          (_, i) => i !== overlayIndex,
                        ),
                      }
                    : c,
                ),
              }
            : t,
        ),
      },
    });
  },

  // ── Zoom Track ──────────────────────────────────────────────────────

  getZoomTrack: () => {
    const { project } = get();
    return project?.tracks.find((t) => t.type === "zoom") ?? null;
  },

  ensureZoomTrack: () => {
    const { project } = get();
    if (!project) return;
    if (project.tracks.some((t) => t.type === "zoom")) return;
    set({
      project: {
        ...project,
        tracks: [
          ...project.tracks,
          {
            id: uuidv4(),
            name: "Zoom",
            type: "zoom" as const,
            clips: [],
            muted: false,
            locked: false,
          },
        ],
      },
    });
  },

  addZoomClip: (trackPosition, duration, params) => {
    const { project, _pushHistory, ensureZoomTrack } = get();
    if (!project) return;
    ensureZoomTrack();
    _pushHistory();

    const updatedProject = get().project;
    if (!updatedProject) return;

    const zoomTrack = updatedProject.tracks.find((t) => t.type === "zoom");
    if (!zoomTrack) return;

    const clip: Clip = {
      id: uuidv4(),
      assetId: ZOOM_ASSET_ID,
      trackPosition,
      sourceStart: 0,
      sourceEnd: duration,
      volume: 1,
      effects: [{
        type: "zoom",
        startTime: 0,
        duration,
        params: {
          scale: params.scale,
          x: params.x,
          y: params.y,
          easing: params.easing ?? "ease-in-out",
          rampIn: params.rampIn ?? 0.3,
          rampOut: params.rampOut ?? 0.3,
        },
      }],
      overlays: [],
    };

    set({
      project: {
        ...updatedProject,
        tracks: updatedProject.tracks.map((t) =>
          t.id === zoomTrack.id ? { ...t, clips: [...t.clips, clip] } : t,
        ),
      },
    });
  },

  // ── Scene Presets ────────────────────────────────────────────────────────

  applyScenePreset: (presetId) => {
    const { project, _pushHistory } = get();
    if (!project || !project.cameraOverlay) return;

    const preset = getPresetById(presetId);
    if (!preset) return;

    _pushHistory();

    if (!preset.camera) {
      // Screen-only: hide camera overlay (keep data so picker remains)
      set({
        project: {
          ...project,
          cameraOverlay: { ...project.cameraOverlay, hidden: true },
        },
      });
      return;
    }

    const cam = preset.camera;
    set({
      project: {
        ...project,
        cameraOverlay: {
          ...project.cameraOverlay,
          x: cam.x,
          y: cam.y,
          width: cam.width,
          height: cam.height,
          shape: cam.shape,
          borderRadius: cam.borderRadius,
          hidden: false,
        },
      },
    });
  },

  // ── Silence Removal ──────────────────────────────────────────────────────

  applySilenceRemoval: (segments) => {
    const { project, selectedClipId, selectedTrackId, _pushHistory } = get();
    if (!project || !selectedClipId || !selectedTrackId) return;
    if (segments.length === 0) return;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    if (!track) return;
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    _pushHistory();
    const sourceStartMs = clip.sourceStart * 1000;
    const sourceEndMs = clip.sourceEnd * 1000;
    const clampedSegments = segments
      .filter((s) => s.endMs > sourceStartMs && s.startMs < sourceEndMs)
      .map((s) => ({
        startMs: Math.max(s.startMs, sourceStartMs),
        endMs: Math.min(s.endMs, sourceEndMs),
      }));
    if (clampedSegments.length === 0) return;
    const updatedTracks = project.tracks.map((t) => {
      const targetClip = t.clips.find(
        (c) =>
          c.assetId === clip.assetId &&
          Math.abs(c.sourceStart - clip.sourceStart) < 0.001 &&
          Math.abs(c.sourceEnd - clip.sourceEnd) < 0.001,
      );
      if (!targetClip) return t;
      const otherClips = t.clips.filter((c) => c.id !== targetClip.id);
      let currentPosition = targetClip.trackPosition;
      const newClips: Clip[] = clampedSegments.map((segment) => {
        const segDuration = (segment.endMs - segment.startMs) / 1000;
        const newClip: Clip = {
          ...targetClip,
          id: uuidv4(),
          sourceStart: segment.startMs / 1000,
          sourceEnd: segment.endMs / 1000,
          trackPosition: currentPosition,
          effects: targetClip.effects.map((e) => ({ ...e })),
          overlays: targetClip.overlays.map((o) => ({ ...o })),
        };
        currentPosition += segDuration;
        return newClip;
      });
      return { ...t, clips: [...otherClips, ...newClips] };
    });
    set({
      project: { ...project, tracks: updatedTracks },
      selectedClipId: null,
    });
  },

  // ── Selection ────────────────────────────────────────────────────────────

  selectClip: (clipId, trackId) =>
    set({
      selectedClipId: clipId,
      selectedTrackId: trackId ?? get().selectedTrackId,
    }),

  selectTrack: (trackId) => set({ selectedTrackId: trackId }),

  // ── Playback ─────────────────────────────────────────────────────────────

  setPlayheadPosition: (position) =>
    set({ playheadPosition: Math.max(0, position) }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),

  // ── Timeline ─────────────────────────────────────────────────────────────

  setTimelineZoom: (zoom) =>
    set({ timelineZoom: Math.max(10, Math.min(500, zoom)) }),

  setTool: (tool) => set({ tool }),
}));
