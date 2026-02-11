import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Project, Track, Clip, Effect, Overlay, Asset } from "@/types/project";

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
  ) => void;

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
  _undoStack: [],
  _redoStack: [],

  // ── History helpers ──────────────────────────────────────────────────────

  _pushHistory: () => {
    const { project, _undoStack } = get();
    if (!project) return;
    const snapshot = structuredClone(project);
    const stack = [..._undoStack, snapshot];
    if (stack.length > MAX_HISTORY) stack.shift();
    set({ _undoStack: stack, _redoStack: [] });
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

  setProject: (project) =>
    set({
      project,
      selectedClipId: null,
      selectedTrackId: null,
      playheadPosition: 0,
      isPlaying: false,
      _undoStack: [],
      _redoStack: [],
    }),

  createNewProject: (name, width = 1920, height = 1080, fps = 30) => {
    const project: Project = {
      id: uuidv4(),
      name,
      resolution: { width, height },
      frameRate: fps,
      tracks: [
        { id: uuidv4(), type: "video", clips: [], muted: false, locked: false },
        { id: uuidv4(), type: "audio", clips: [], muted: false, locked: false },
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
    });
  },

  createProjectFromRecording: (filePath, durationSec = 10, zoomEffects = []) => {
    const assetId = uuidv4();
    const fileName = filePath.split("/").pop() ?? "Recording";
    const projectName = fileName.replace(/\.[^.]+$/, "");

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

    const videoClip: Clip = {
      id: uuidv4(),
      assetId,
      trackPosition: 0,
      sourceStart: 0,
      sourceEnd: durationSec,
      volume: 1,
      effects: zoomEffects,
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
      ],
      assets: [asset],
    };

    set({
      project,
      selectedClipId: null,
      selectedTrackId: null,
      playheadPosition: 0,
      isPlaying: false,
      _undoStack: [],
      _redoStack: [],
    });
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
