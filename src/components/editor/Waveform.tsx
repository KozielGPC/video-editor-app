import { useRef, useEffect, memo } from "react";
import WaveSurfer from "wavesurfer.js";

interface WaveformProps {
  audioUrl: string;
  height: number;
  width: number;
}

function Waveform({ audioUrl, height, width }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    // Destroy any existing instance before creating a new one
    wsRef.current?.destroy();

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      waveColor: "#525252",
      progressColor: "#3b82f6",
      height,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      interact: false,
      cursorWidth: 0,
      normalize: true,
      hideScrollbar: true,
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl, height]);

  return (
    <div
      ref={containerRef}
      style={{ width, height }}
      className="overflow-hidden pointer-events-none"
    />
  );
}

export default memo(Waveform);
