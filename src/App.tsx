import { useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
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
      <AppShell />
    </BrowserRouter>
  );
}
