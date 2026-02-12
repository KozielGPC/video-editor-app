import { useState, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import {
  X,
  Monitor,
  AppWindow,
  Camera,
  Search,
  Plus,
  RefreshCw,
  Star,
  Loader2,
} from "lucide-react";
import { useCaptureSources } from "@/hooks/useCaptureSources";
import type {
  CapturableWindow,
  CapturableScreen,
  CaptureCamera,
  SceneSource,
  SourceType,
} from "@/types/capture";

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────────────────────────── */

interface SourcePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSource: (source: SceneSource) => void;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Thumbnail Component
 * ───────────────────────────────────────────────────────────────────────────── */

interface ThumbnailProps {
  src: string | null;
  alt: string;
  icon: React.ReactNode;
}

function Thumbnail({ src, alt, icon }: ThumbnailProps) {
  if (src) {
    // Ensure the thumbnail has the proper data URI prefix
    const imgSrc = src.startsWith("data:") ? src : `data:image/png;base64,${src}`;
    return (
      <img
        src={imgSrc}
        alt={alt}
        className="w-full h-full object-cover"
        draggable={false}
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500">
      {icon}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Source Item Components
 * ───────────────────────────────────────────────────────────────────────────── */

interface ScreenItemProps {
  screen: CapturableScreen;
  onAdd: () => void;
}

function ScreenItem({ screen, onAdd }: ScreenItemProps) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden hover:border-neutral-600 hover:bg-neutral-800 transition-all duration-150">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-neutral-900">
        <Thumbnail
          src={screen.thumbnail}
          alt={screen.name}
          icon={<Monitor size={32} />}
        />
        {/* Main display badge */}
        {screen.isMain && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-xs text-blue-400">
            <Star size={10} className="fill-current" />
            Main
          </div>
        )}
        {/* Add button overlay */}
        <button
          onClick={onAdd}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
            <Plus size={16} />
            Add
          </div>
        </button>
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-neutral-200 truncate">
          {screen.name}
        </p>
        <p className="text-xs text-neutral-500">
          {screen.width} × {screen.height}
        </p>
      </div>
    </div>
  );
}

interface WindowItemProps {
  window: CapturableWindow;
  onAdd: () => void;
}

function WindowItem({ window, onAdd }: WindowItemProps) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden hover:border-neutral-600 hover:bg-neutral-800 transition-all duration-150">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-neutral-900">
        <Thumbnail
          src={window.thumbnail}
          alt={window.title}
          icon={<AppWindow size={32} />}
        />
        {/* Add button overlay */}
        <button
          onClick={onAdd}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
            <Plus size={16} />
            Add
          </div>
        </button>
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-neutral-200 truncate">
          {window.title || "Untitled Window"}
        </p>
        <p className="text-xs text-neutral-500 truncate">{window.ownerName}</p>
      </div>
    </div>
  );
}

interface CameraItemProps {
  camera: CaptureCamera;
  onAdd: () => void;
}

function CameraItem({ camera, onAdd }: CameraItemProps) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 overflow-hidden hover:border-neutral-600 hover:bg-neutral-800 transition-all duration-150">
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video bg-neutral-900">
        <div className="w-full h-full flex items-center justify-center text-neutral-500">
          <Camera size={32} />
        </div>
        {/* Add button overlay */}
        <button
          onClick={onAdd}
          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
            <Plus size={16} />
            Add
          </div>
        </button>
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-neutral-200 truncate">
          {camera.name}
        </p>
        <p className="text-xs text-neutral-500">Camera</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Empty State
 * ───────────────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-neutral-500 mb-3">{icon}</div>
      <p className="text-sm font-medium text-neutral-300">{title}</p>
      <p className="text-xs text-neutral-500 mt-1">{description}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Source Grid
 * ───────────────────────────────────────────────────────────────────────────── */

function SourceGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{children}</div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Main Component
 * ───────────────────────────────────────────────────────────────────────────── */

export default function SourcePicker({
  open,
  onOpenChange,
  onAddSource,
}: SourcePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("screens");

  const { sources, isLoading, refresh } = useCaptureSources(open);

  // Generate a unique ID for new sources
  const generateSourceId = useCallback(() => {
    return `source-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Create a SceneSource from a capture source
  const createSceneSource = useCallback(
    (
      type: SourceType,
      sourceId: number | string,
      name: string
    ): SceneSource => ({
      id: generateSourceId(),
      type,
      sourceId,
      name,
      // Default to full canvas
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 0,
      visible: true,
    }),
    [generateSourceId]
  );

  // Handle adding sources
  const handleAddScreen = useCallback(
    (screen: CapturableScreen) => {
      const source = createSceneSource("screen", screen.id, screen.name);
      onAddSource(source);
      onOpenChange(false);
    },
    [createSceneSource, onAddSource, onOpenChange]
  );

  const handleAddWindow = useCallback(
    (window: CapturableWindow) => {
      const source = createSceneSource(
        "window",
        window.id,
        window.title || window.ownerName
      );
      onAddSource(source);
      onOpenChange(false);
    },
    [createSceneSource, onAddSource, onOpenChange]
  );

  const handleAddCamera = useCallback(
    (camera: CaptureCamera) => {
      const source = createSceneSource("camera", camera.id, camera.name);
      // Cameras default to bottom-right corner, smaller size
      source.x = 70;
      source.y = 70;
      source.width = 25;
      source.height = 25;
      onAddSource(source);
      onOpenChange(false);
    },
    [createSceneSource, onAddSource, onOpenChange]
  );

  // Filter sources based on search query
  const filteredSources = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return sources;

    return {
      screens: sources.screens.filter((s) =>
        s.name.toLowerCase().includes(query)
      ),
      windows: sources.windows.filter(
        (w) =>
          w.title.toLowerCase().includes(query) ||
          w.ownerName.toLowerCase().includes(query)
      ),
      cameras: sources.cameras.filter((c) =>
        c.name.toLowerCase().includes(query)
      ),
    };
  }, [sources, searchQuery]);

  // Counts for tab badges
  const counts = useMemo(
    () => ({
      screens: filteredSources.screens.length,
      windows: filteredSources.windows.length,
      cameras: filteredSources.cameras.length,
    }),
    [filteredSources]
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] max-h-[85vh]
            bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-[201] flex flex-col overflow-hidden"
        >
          {/* Hidden description for accessibility */}
          <Dialog.Description className="sr-only">
            Choose a screen, window, or camera to add as a source to your scene.
          </Dialog.Description>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
            <Dialog.Title className="text-lg font-semibold text-neutral-100">
              Add Source
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={isLoading}
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                title="Refresh sources"
              >
                <RefreshCw
                  size={18}
                  className={isLoading ? "animate-spin" : ""}
                />
              </button>
              <Dialog.Close asChild>
                <button
                  className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-neutral-800">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                type="text"
                placeholder="Search sources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-neutral-800 border border-neutral-700 rounded-lg
                  text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-neutral-600"
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs.Root
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 flex flex-col min-h-0"
          >
            <Tabs.List className="flex border-b border-neutral-700 px-4">
              <Tabs.Trigger
                value="screens"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-400
                  data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                  data-[state=active]:border-blue-500 hover:text-neutral-300 transition-colors outline-none"
              >
                <Monitor size={16} />
                Screens
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-800 text-neutral-500">
                  {counts.screens}
                </span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="windows"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-400
                  data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                  data-[state=active]:border-blue-500 hover:text-neutral-300 transition-colors outline-none"
              >
                <AppWindow size={16} />
                Windows
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-800 text-neutral-500">
                  {counts.windows}
                </span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="cameras"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-400
                  data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                  data-[state=active]:border-blue-500 hover:text-neutral-300 transition-colors outline-none"
              >
                <Camera size={16} />
                Cameras
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-neutral-800 text-neutral-500">
                  {counts.cameras}
                </span>
              </Tabs.Trigger>
            </Tabs.List>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-neutral-500" />
                </div>
              ) : (
                <>
                  {/* Screens Tab */}
                  <Tabs.Content value="screens" className="outline-none">
                    {filteredSources.screens.length > 0 ? (
                      <SourceGrid>
                        {filteredSources.screens.map((screen) => (
                          <ScreenItem
                            key={screen.id}
                            screen={screen}
                            onAdd={() => handleAddScreen(screen)}
                          />
                        ))}
                      </SourceGrid>
                    ) : (
                      <EmptyState
                        icon={<Monitor size={40} />}
                        title="No screens found"
                        description={
                          searchQuery
                            ? "Try a different search term"
                            : "No displays detected"
                        }
                      />
                    )}
                  </Tabs.Content>

                  {/* Windows Tab */}
                  <Tabs.Content value="windows" className="outline-none">
                    {filteredSources.windows.length > 0 ? (
                      <SourceGrid>
                        {filteredSources.windows.map((window) => (
                          <WindowItem
                            key={window.id}
                            window={window}
                            onAdd={() => handleAddWindow(window)}
                          />
                        ))}
                      </SourceGrid>
                    ) : (
                      <EmptyState
                        icon={<AppWindow size={40} />}
                        title="No windows found"
                        description={
                          searchQuery
                            ? "Try a different search term"
                            : "No capturable windows detected"
                        }
                      />
                    )}
                  </Tabs.Content>

                  {/* Cameras Tab */}
                  <Tabs.Content value="cameras" className="outline-none">
                    {filteredSources.cameras.length > 0 ? (
                      <SourceGrid>
                        {filteredSources.cameras.map((camera) => (
                          <CameraItem
                            key={camera.id}
                            camera={camera}
                            onAdd={() => handleAddCamera(camera)}
                          />
                        ))}
                      </SourceGrid>
                    ) : (
                      <EmptyState
                        icon={<Camera size={40} />}
                        title="No cameras found"
                        description={
                          searchQuery
                            ? "Try a different search term"
                            : "No webcams or cameras detected"
                        }
                      />
                    )}
                  </Tabs.Content>
                </>
              )}
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
