import { useRef, useEffect, useState, memo } from "react";

interface WaveformProps {
  audioUrl: string;
  height: number;
  width: number;
  sourceStart?: number;
  sourceEnd?: number;
  totalDuration?: number;
}

/** Number of bars to draw per pixel of width */
const BARS_PER_PX = 0.4;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_RADIUS = 1;
const WAVE_COLOR = "#4ade80";          // green-400 — visible on the dark green track
const WAVE_COLOR_DIMMED = "#166534";   // green-800 — subtle background

/**
 * Decode audio from a URL and extract normalised peak data.
 * Uses fetch + Web Audio API — works with custom Tauri protocols.
 */
async function extractPeaks(url: string, numBars: number): Promise<Float32Array> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  // Mix down to mono
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
  const len = ch0.length;
  const samplesPerBar = Math.max(1, Math.floor(len / numBars));
  const peaks = new Float32Array(numBars);

  for (let i = 0; i < numBars; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(start + samplesPerBar, len);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs((ch0[j] + ch1[j]) * 0.5);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  // Normalise
  let globalMax = 0;
  for (let i = 0; i < numBars; i++) {
    if (peaks[i] > globalMax) globalMax = peaks[i];
  }
  if (globalMax > 0) {
    for (let i = 0; i < numBars; i++) {
      peaks[i] /= globalMax;
    }
  }

  return peaks;
}

/** Draw bars onto a canvas from peaks data */
function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  width: number,
  height: number,
  startRatio: number,
  endRatio: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const totalBars = peaks.length;
  const startBar = Math.floor(startRatio * totalBars);
  const endBar = Math.ceil(endRatio * totalBars);
  const visibleBars = endBar - startBar;
  if (visibleBars <= 0) return;

  const step = BAR_WIDTH + BAR_GAP;
  const numDrawn = Math.floor(width / step);
  const barSamplesRatio = visibleBars / numDrawn;

  const midY = height / 2;
  const maxAmp = (height - 2) / 2; // 1px margin top/bottom

  for (let i = 0; i < numDrawn; i++) {
    const peakIdx = startBar + Math.floor(i * barSamplesRatio);
    if (peakIdx >= totalBars) break;

    const amplitude = peaks[peakIdx];
    const barH = Math.max(2, amplitude * maxAmp * 2);
    const x = i * step;
    const y = midY - barH / 2;

    ctx.fillStyle = amplitude > 0.05 ? WAVE_COLOR : WAVE_COLOR_DIMMED;

    if (BAR_RADIUS > 0) {
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_WIDTH, barH, BAR_RADIUS);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, BAR_WIDTH, barH);
    }
  }
}

// Simple in-memory cache keyed by URL to avoid re-decoding on every re-render
const peaksCache = new Map<string, Float32Array>();

function Waveform({ audioUrl, height, width, sourceStart, sourceEnd, totalDuration }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [error, setError] = useState(false);

  // Determine how many bars we need for the full audio
  const numBars = Math.max(64, Math.round(width * BARS_PER_PX * 4)); // oversample for trimming

  // Decode audio and extract peaks
  useEffect(() => {
    if (!audioUrl) return;
    setError(false);

    const cached = peaksCache.get(audioUrl);
    if (cached) {
      setPeaks(cached);
      return;
    }

    let cancelled = false;
    extractPeaks(audioUrl, numBars)
      .then((p) => {
        if (!cancelled) {
          peaksCache.set(audioUrl, p);
          setPeaks(p);
        }
      })
      .catch((err) => {
        console.warn("Waveform: failed to decode audio", err);
        if (!cancelled) setError(true);
      });

    return () => { cancelled = true; };
  }, [audioUrl, numBars]);

  // Compute visible range for trimmed clips
  const startRatio = (totalDuration && totalDuration > 0 && sourceStart !== undefined)
    ? sourceStart / totalDuration
    : 0;
  const endRatio = (totalDuration && totalDuration > 0 && sourceEnd !== undefined)
    ? sourceEnd / totalDuration
    : 1;

  // Draw whenever peaks, dimensions, or trim range change
  useEffect(() => {
    if (!canvasRef.current || !peaks) return;
    drawWaveform(canvasRef.current, peaks, width, height, startRatio, endRatio);
  }, [peaks, width, height, startRatio, endRatio]);

  if (error || !audioUrl) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="pointer-events-none"
    />
  );
}

export default memo(Waveform);
