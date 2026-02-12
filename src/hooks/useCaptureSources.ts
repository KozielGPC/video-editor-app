import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CapturableWindow,
  CapturableScreen,
  CaptureCamera,
  AvailableSources,
} from "@/types/capture";

/** Refresh interval for auto-updating sources (ms) */
const REFRESH_INTERVAL = 2500;

interface UseCaptureSources {
  sources: AvailableSources;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Start auto-refresh polling */
  startPolling: () => void;
  /** Stop auto-refresh polling */
  stopPolling: () => void;
}

/**
 * Hook to fetch capturable windows, screens, and cameras via Tauri.
 * Auto-refreshes every 2.5 seconds to catch new windows.
 */
export function useCaptureSources(autoRefresh = true): UseCaptureSources {
  const [sources, setSources] = useState<AvailableSources>({
    windows: [],
    screens: [],
    cameras: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [windowsResult, screensResult, camerasResult] =
        await Promise.allSettled([
          invoke<CapturableWindow[]>("list_capturable_windows"),
          invoke<CapturableScreen[]>("list_capturable_screens"),
          invoke<CaptureCamera[]>("list_cameras"),
        ]);

      const windows =
        windowsResult.status === "fulfilled" ? windowsResult.value : [];
      const screens =
        screensResult.status === "fulfilled" ? screensResult.value : [];
      const cameras =
        camerasResult.status === "fulfilled" ? camerasResult.value : [];

      // Log errors if any
      if (windowsResult.status === "rejected") {
        console.warn("Failed to list windows:", windowsResult.reason);
      }
      if (screensResult.status === "rejected") {
        console.warn("Failed to list screens:", screensResult.reason);
      }
      if (camerasResult.status === "rejected") {
        console.warn("Failed to list cameras:", camerasResult.reason);
      }

      setSources({ windows, screens, cameras });
      setError(null);
    } catch (err) {
      console.error("Failed to fetch capture sources:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch sources");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(refresh, REFRESH_INTERVAL);
  }, [refresh]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    refresh();

    if (autoRefresh) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [refresh, autoRefresh, startPolling, stopPolling]);

  return {
    sources,
    isLoading,
    error,
    refresh,
    startPolling,
    stopPolling,
  };
}
