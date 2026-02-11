import { useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { X, Download, Sparkles } from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import type { ExportConfig } from "@/types/project";

/* ------------------------------------------------------------------ */
/* Option data                                                          */
/* ------------------------------------------------------------------ */

interface FormatOption {
  label: string;
  value: ExportConfig["format"];
  codec: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP4 (H.264)", value: "mp4", codec: "h264" },
  { label: "MOV (ProRes)", value: "mov", codec: "prores" },
  { label: "WebM (VP9)", value: "webm", codec: "vp9" },
];

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { label: "1920 × 1080", width: 1920, height: 1080 },
  { label: "2560 × 1440", width: 2560, height: 1440 },
  { label: "3840 × 2160", width: 3840, height: 2160 },
];

interface AspectOption {
  label: string;
  ratio: string;
  widthFactor: number;
  heightFactor: number;
}

const ASPECT_OPTIONS: AspectOption[] = [
  { label: "16:9 (YouTube)", ratio: "16:9", widthFactor: 16, heightFactor: 9 },
  { label: "9:16 (TikTok)", ratio: "9:16", widthFactor: 9, heightFactor: 16 },
  {
    label: "1:1 (Instagram)",
    ratio: "1:1",
    widthFactor: 1,
    heightFactor: 1,
  },
];

interface QualityOption {
  label: string;
  crf: number;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { label: "Low", crf: 28 },
  { label: "Medium", crf: 23 },
  { label: "High", crf: 18 },
];

const AUDIO_BITRATES = ["128k", "192k", "256k", "320k"] as const;

interface Preset {
  label: string;
  format: ExportConfig["format"];
  codec: string;
  width: number;
  height: number;
  crf: number;
  audioBitrate: string;
}

const PRESETS: Preset[] = [
  {
    label: "YouTube 1080p",
    format: "mp4",
    codec: "h264",
    width: 1920,
    height: 1080,
    crf: 18,
    audioBitrate: "256k",
  },
  {
    label: "YouTube 4K",
    format: "mp4",
    codec: "h264",
    width: 3840,
    height: 2160,
    crf: 18,
    audioBitrate: "320k",
  },
  {
    label: "TikTok",
    format: "mp4",
    codec: "h264",
    width: 1080,
    height: 1920,
    crf: 23,
    audioBitrate: "192k",
  },
  {
    label: "Instagram",
    format: "mp4",
    codec: "h264",
    width: 1080,
    height: 1080,
    crf: 23,
    audioBitrate: "192k",
  },
];

/* ------------------------------------------------------------------ */
/* Styled helpers                                                       */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
      {children}
    </h3>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-md text-sm font-medium border transition-interactive
        ${
          active
            ? "bg-blue-500/15 border-blue-500/50 text-blue-400"
            : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
        }
      `}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Export Dialog component                                              */
/* ------------------------------------------------------------------ */

export default function ExportDialog() {
  const open = useUIStore((s) => s.showExportDialog);
  const setOpen = useUIStore((s) => s.setShowExportDialog);
  const setShowProgress = useUIStore((s) => s.setShowExportProgress);
  const project = useEditorStore((s) => s.project);

  /* Local form state */
  const [format, setFormat] = useState<ExportConfig["format"]>("mp4");
  const [codec, setCodec] = useState("h264");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [crf, setCrf] = useState(18);
  const [audioBitrate, setAudioBitrate] = useState("256k");
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [customCrf, setCustomCrf] = useState("");

  const [isCustomRes, setIsCustomRes] = useState(false);
  const [isCustomQuality, setIsCustomQuality] = useState(false);

  /* Apply a preset */
  const applyPreset = useCallback((preset: Preset) => {
    setFormat(preset.format);
    setCodec(preset.codec);
    setWidth(preset.width);
    setHeight(preset.height);
    setCrf(preset.crf);
    setAudioBitrate(preset.audioBitrate);
    setIsCustomRes(false);
    setIsCustomQuality(false);
  }, []);

  /* Export action */
  const handleExport = useCallback(async () => {
    const finalWidth = isCustomRes ? parseInt(customWidth) || 1920 : width;
    const finalHeight = isCustomRes ? parseInt(customHeight) || 1080 : height;
    const finalCrf = isCustomQuality ? parseInt(customCrf) || 23 : crf;

    const config: ExportConfig = {
      projectId: project?.id ?? "",
      format,
      codec,
      width: finalWidth,
      height: finalHeight,
      fps: project?.fps ?? 30,
      crf: finalCrf,
      audioBitrate,
      outputPath: "",
    };

    try {
      await invoke("start_export", { config });
      setOpen(false);
      setShowProgress(true);
    } catch (err) {
      console.error("Failed to start export:", err);
    }
  }, [
    format,
    codec,
    width,
    height,
    crf,
    audioBitrate,
    isCustomRes,
    isCustomQuality,
    customWidth,
    customHeight,
    customCrf,
    project,
    setOpen,
    setShowProgress,
  ]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[85vh] overflow-y-auto rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl shadow-black/50 p-6 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
              <Download size={20} className="text-blue-400" />
              Export Video
            </Dialog.Title>
            <Dialog.Close className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-interactive">
              <X size={18} />
            </Dialog.Close>
          </div>

          {/* Presets */}
          <section className="mb-6">
            <SectionTitle>Quick Presets</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-neutral-800 border border-neutral-700 text-neutral-300 hover:border-blue-500/50 hover:text-blue-400 transition-interactive"
                >
                  <Sparkles size={12} />
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          {/* Format */}
          <section className="mb-5">
            <SectionTitle>Format</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.value}
                  active={format === opt.value}
                  onClick={() => {
                    setFormat(opt.value);
                    setCodec(opt.codec);
                  }}
                >
                  {opt.label}
                </OptionButton>
              ))}
            </div>
          </section>

          {/* Resolution */}
          <section className="mb-5">
            <SectionTitle>Resolution</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {RESOLUTION_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.label}
                  active={
                    !isCustomRes &&
                    width === opt.width &&
                    height === opt.height
                  }
                  onClick={() => {
                    setWidth(opt.width);
                    setHeight(opt.height);
                    setIsCustomRes(false);
                  }}
                >
                  {opt.label}
                </OptionButton>
              ))}
              <OptionButton
                active={isCustomRes}
                onClick={() => setIsCustomRes(true)}
              >
                Custom
              </OptionButton>
            </div>
            {isCustomRes && (
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="number"
                  placeholder="Width"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  className="w-24 px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                />
                <span className="text-neutral-500 text-sm">×</span>
                <input
                  type="number"
                  placeholder="Height"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  className="w-24 px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>
            )}
          </section>

          {/* Aspect Ratio */}
          <section className="mb-5">
            <SectionTitle>Aspect Ratio</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {ASPECT_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.ratio}
                  active={false}
                  onClick={() => {
                    /* Adjust height based on current width */
                    const newHeight = Math.round(
                      (width / opt.widthFactor) * opt.heightFactor
                    );
                    setHeight(newHeight);
                    setIsCustomRes(false);
                  }}
                >
                  {opt.label}
                </OptionButton>
              ))}
            </div>
          </section>

          {/* Quality */}
          <section className="mb-5">
            <SectionTitle>Quality</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {QUALITY_OPTIONS.map((opt) => (
                <OptionButton
                  key={opt.label}
                  active={!isCustomQuality && crf === opt.crf}
                  onClick={() => {
                    setCrf(opt.crf);
                    setIsCustomQuality(false);
                  }}
                >
                  {opt.label} (CRF {opt.crf})
                </OptionButton>
              ))}
              <OptionButton
                active={isCustomQuality}
                onClick={() => setIsCustomQuality(true)}
              >
                Custom
              </OptionButton>
            </div>
            {isCustomQuality && (
              <div className="mt-3">
                <input
                  type="number"
                  min={0}
                  max={51}
                  placeholder="CRF (0-51)"
                  value={customCrf}
                  onChange={(e) => setCustomCrf(e.target.value)}
                  className="w-32 px-3 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                />
                <span className="ml-2 text-xs text-neutral-500">
                  Lower = higher quality
                </span>
              </div>
            )}
          </section>

          {/* Audio Bitrate */}
          <section className="mb-8">
            <SectionTitle>Audio Bitrate</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {AUDIO_BITRATES.map((br) => (
                <OptionButton
                  key={br}
                  active={audioBitrate === br}
                  onClick={() => setAudioBitrate(br)}
                >
                  {br}
                </OptionButton>
              ))}
            </div>
          </section>

          {/* Summary & Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
            <div className="text-xs text-neutral-500">
              {format.toUpperCase()} · {isCustomRes ? `${customWidth || "?"}×${customHeight || "?"}` : `${width}×${height}`} · CRF{" "}
              {isCustomQuality ? customCrf || "?" : crf} · {audioBitrate}
            </div>
            <div className="flex gap-3">
              <Dialog.Close className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 bg-neutral-800 border border-neutral-700 hover:bg-neutral-750 hover:border-neutral-600 transition-interactive">
                Cancel
              </Dialog.Close>
              <button
                onClick={handleExport}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/20 transition-interactive"
              >
                Export
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
