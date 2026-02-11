import { useRef, useCallback, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";

/**
 * Playback controller that drives the editor playhead using
 * requestAnimationFrame for smooth, frame-accurate movement.
 */
export function usePlayback() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const playheadPosition = useEditorStore((s) => s.playheadPosition);
  const setPlayheadPosition = useEditorStore((s) => s.setPlayheadPosition);
  const project = useEditorStore((s) => s.project);

  const rafId = useRef<number | null>(null);
  const lastTimestamp = useRef<number>(0);

  /** Total project duration derived from the furthest clip end (ms). */
  const projectDuration = useRef(0);
  useEffect(() => {
    if (!project) {
      projectDuration.current = 0;
      return;
    }
    let max = 0;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const end = clip.trackPosition + (clip.sourceEnd - clip.sourceStart);
        if (end > max) max = end;
      }
    }
    projectDuration.current = max;
  }, [project]);

  /* ── Animation loop ──────────────────────────────────────── */
  const tick = useCallback(
    (now: number) => {
      if (lastTimestamp.current === 0) {
        lastTimestamp.current = now;
      }

      const deltaMs = now - lastTimestamp.current;
      lastTimestamp.current = now;

      const currentPos = useEditorStore.getState().playheadPosition;
      const next = currentPos + deltaMs;

      if (next >= projectDuration.current && projectDuration.current > 0) {
        setPlayheadPosition(projectDuration.current);
        setIsPlaying(false);
        return;
      }

      setPlayheadPosition(next);
      rafId.current = requestAnimationFrame(tick);
    },
    [setPlayheadPosition, setIsPlaying],
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimestamp.current = 0;
      rafId.current = requestAnimationFrame(tick);
    } else if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [isPlaying, tick]);

  /* ── Public API ──────────────────────────────────────────── */
  const play = useCallback(() => setIsPlaying(true), [setIsPlaying]);

  const pause = useCallback(() => setIsPlaying(false), [setIsPlaying]);

  const toggle = useCallback(
    () => setIsPlaying(!useEditorStore.getState().isPlaying),
    [setIsPlaying],
  );

  const seekTo = useCallback(
    (ms: number) => setPlayheadPosition(Math.max(0, ms)),
    [setPlayheadPosition],
  );

  const skipForward = useCallback(
    (ms: number) => {
      const cur = useEditorStore.getState().playheadPosition;
      setPlayheadPosition(cur + ms);
    },
    [setPlayheadPosition],
  );

  const skipBackward = useCallback(
    (ms: number) => {
      const cur = useEditorStore.getState().playheadPosition;
      setPlayheadPosition(Math.max(0, cur - ms));
    },
    [setPlayheadPosition],
  );

  return { isPlaying, play, pause, toggle, seekTo, skipForward, skipBackward };
}
