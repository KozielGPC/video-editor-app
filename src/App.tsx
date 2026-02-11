import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import OverlayView from "@/components/recorder/OverlayView";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useMediaSources } from "@/hooks/useMediaSources";

export default function App() {
  useShortcuts();

  const { refresh } = useMediaSources();
  useEffect(() => {
    void refresh;
  }, [refresh]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/overlay" element={<OverlayView />} />
      </Routes>
    </BrowserRouter>
  );
}
