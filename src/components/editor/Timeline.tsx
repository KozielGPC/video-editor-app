import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Plus, Video, Music, Layers } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import TimelineTrack, { HEADER_WIDTH, TRACK_HEIGHT } from "./TimelineTrack";

// ─── Ruler helpers ───────────────────────────────────────────────────────────

function getTickInterval(zoom: number): { major: number; minor: number } {
  if (zoom >= 300) return { major: 0.5, minor: 0.1 };
  if (zoom >= 200) return { major: 1, minor: 0.25 };
  if (zoom >= 100) return { major: 2, minor: 0.5 };
  if (zoom >= 50) return { major: 5, minor: 1 };
  if (zoom >= 20) return { major: 10, minor: 2 };
  return { major: 30, minor: 5 };
}

function formatRulerTime(seconds: number): string {
  if (seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) {
    return `${m}:${Math.floor(s).toString().padStart(2, "0")}`;
  }
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RULER_HEIGHT = 28;

// ─── Component ───────────────────────────────────────────────────────────────

export default function Timeline() {
  const {
    project,
    playheadPosition,
    setPlayheadPosition,
    timelineZoom,
    setTimelineZoom,
    addTrack,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const tracks = project?.tracks ?? [];

  // ── Computed total duration & width ──────────────────────────────────────

  const totalDuration = useMemo(() => {
    if (!tracks.length) return 60;
    const maxTime = tracks.reduce(
      (max, track) =>
        track.clips.reduce((tMax, clip) => {
          const end = clip.trackPosition + (clip.sourceEnd - clip.sourceStart);
          return Math.max(tMax, end);
        }, max),
      0,
    );
    return Math.max(maxTime + 10, 60);
  }, [tracks]);

  const totalWidth = totalDuration * timelineZoom;

  // ── Zoom with Cmd+Scroll ────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setTimelineZoom(timelineZoom + delta);
      }
    },
    [timelineZoom, setTimelineZoom],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Playhead click + drag ───────────────────────────────────────────────

  const positionFromMouse = useCallback(
    (clientX: number): number => {
      const container = scrollRef.current;
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + container.scrollLeft - HEADER_WIDTH;
      return Math.max(0, x / timelineZoom);
    },
    [timelineZoom],
  );

  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setPlayheadPosition(positionFromMouse(e.clientX));
      setIsDraggingPlayhead(true);
    },
    [positionFromMouse, setPlayheadPosition],
  );

  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const onMove = (e: MouseEvent) =>
      setPlayheadPosition(positionFromMouse(e.clientX));
    const onUp = () => setIsDraggingPlayhead(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDraggingPlayhead, positionFromMouse, setPlayheadPosition]);

  // ── Ruler ticks ─────────────────────────────────────────────────────────

  const { major, minor } = getTickInterval(timelineZoom);

  const ticks = useMemo(() => {
    const result: { time: number; isMajor: boolean }[] = [];
    const step = minor;
    for (let t = 0; t <= totalDuration; t = +(t + step).toFixed(4)) {
      const isMaj = Math.abs(t % major) < 0.001 || Math.abs(t % major - major) < 0.001;
      result.push({ time: t, isMajor: isMaj });
    }
    return result;
  }, [totalDuration, major, minor]);

  const playheadLeft = HEADER_WIDTH + playheadPosition * timelineZoom;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        {/* Content wrapper */}
        <div
          className="relative"
          style={{
            width: totalWidth + HEADER_WIDTH + 200, // extra padding right
            minHeight: "100%",
          }}
        >
          {/* ── Ruler row ────────────────────────────────────────── */}
          <div
            className="sticky top-0 z-20 flex select-none"
            style={{ height: RULER_HEIGHT }}
          >
            {/* Corner cell */}
            <div
              className="sticky left-0 z-30 bg-neutral-900 border-b border-r border-neutral-700
                flex items-center justify-center"
              style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}
            >
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-medium">
                Tracks
              </span>
            </div>

            {/* Ruler ticks area */}
            <div
              className="flex-1 relative bg-neutral-900 border-b border-neutral-700 cursor-pointer"
              onMouseDown={handleRulerMouseDown}
            >
              {ticks.map(({ time, isMajor }) => (
                <div
                  key={time}
                  className="absolute top-0 bottom-0"
                  style={{ left: time * timelineZoom }}
                >
                  <div
                    className={`w-px ${
                      isMajor
                        ? "h-full bg-neutral-600"
                        : "h-2/5 bg-neutral-700 mt-auto"
                    }`}
                    style={!isMajor ? { position: "absolute", bottom: 0 } : undefined}
                  />
                  {isMajor && (
                    <span className="absolute top-1 left-1 text-[9px] text-neutral-400 whitespace-nowrap font-mono">
                      {formatRulerTime(time)}
                    </span>
                  )}
                </div>
              ))}

              {/* Playhead indicator on ruler */}
              <div
                className="absolute top-0 z-10"
                style={{ left: playheadPosition * timelineZoom }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  className="fill-red-500"
                  style={{ transform: "translateX(-5px)" }}
                >
                  <polygon points="0,0 10,0 5,10" />
                </svg>
              </div>
            </div>
          </div>

          {/* ── Track rows ───────────────────────────────────────── */}
          {tracks.map((track, index) => (
            <TimelineTrack
              key={track.id}
              track={track}
              trackIndex={index}
            />
          ))}

          {/* ── Add track row ────────────────────────────────────── */}
          <div className="flex" style={{ height: TRACK_HEIGHT }}>
            <div
              className="sticky left-0 z-10 bg-neutral-900/50 border-r border-neutral-700
                flex items-center justify-center"
              style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}
            >
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className="flex items-center gap-1 text-xs text-neutral-500
                      hover:text-neutral-200 px-2 py-1 rounded hover:bg-neutral-800 transition-colors"
                  >
                    <Plus size={14} />
                    Add Track
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[140px] bg-neutral-800 border border-neutral-700
                      rounded-lg p-1 shadow-2xl z-[100]"
                    sideOffset={5}
                  >
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200
                        rounded hover:bg-neutral-700 cursor-pointer outline-none
                        data-[highlighted]:bg-neutral-700"
                      onSelect={() => addTrack("video")}
                    >
                      <Video size={14} className="text-blue-400" /> Video
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200
                        rounded hover:bg-neutral-700 cursor-pointer outline-none
                        data-[highlighted]:bg-neutral-700"
                      onSelect={() => addTrack("audio")}
                    >
                      <Music size={14} className="text-green-400" /> Audio
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200
                        rounded hover:bg-neutral-700 cursor-pointer outline-none
                        data-[highlighted]:bg-neutral-700"
                      onSelect={() => addTrack("overlay")}
                    >
                      <Layers size={14} className="text-purple-400" /> Overlay
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            <div className="flex-1 border-b border-neutral-800/50" />
          </div>

          {/* ── Empty state ──────────────────────────────────────── */}
          {tracks.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-neutral-600">
                Add a track to get started
              </p>
            </div>
          )}

          {/* ── Playhead line ────────────────────────────────────── */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
            style={{ left: playheadLeft }}
          />
        </div>
      </div>
    </div>
  );
}
