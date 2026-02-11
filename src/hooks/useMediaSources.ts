import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRecorderStore } from "@/stores/recorderStore";
import type {
  ScreenSource,
  CameraSource,
  MicSource,
} from "@/types/recording";

/**
 * Enumerates available screens, cameras, and microphones via Tauri commands
 * and stores them in the recorder store.
 */
export function useMediaSources() {
  const {
    screens,
    cameras,
    microphones,
    setScreens,
    setCameras,
    setMicrophones,
  } = useRecorderStore();

  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [screenList, cameraList, micList] = await Promise.allSettled([
        invoke<ScreenSource[]>("list_screens"),
        invoke<CameraSource[]>("list_cameras"),
        invoke<MicSource[]>("list_microphones"),
      ]);

      if (screenList.status === "fulfilled") {
        setScreens(screenList.value);
      } else {
        console.error("Failed to list screens:", screenList.reason);
      }
      if (cameraList.status === "fulfilled") {
        setCameras(cameraList.value);
      } else {
        console.error("Failed to list cameras:", cameraList.reason);
      }
      if (micList.status === "fulfilled") {
        setMicrophones(micList.value);
      } else {
        console.error("Failed to list microphones:", micList.reason);
      }
    } catch (err) {
      console.error("Failed to fetch media sources:", err);
    } finally {
      setIsLoading(false);
    }
  }, [setScreens, setCameras, setMicrophones]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { screens, cameras, microphones, isLoading, refresh };
}
