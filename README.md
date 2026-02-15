# AutoEditor

A desktop screen recorder and video editor built with [Tauri](https://tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/). Record your screen, edit videos with a timeline-based editor, automatically detect and remove silent parts, add effects and overlays -- all from a single native application.

> **Note:** AutoEditor is currently in early development (v0.1.0). Expect breaking changes and missing features.

<!-- TODO: Add a screenshot or demo GIF here -->
<!-- ![AutoEditor Screenshot](docs/screenshots/editor.png) -->

## Features

### Screen Recording
- **Multi-source capture** -- record screen, webcam, and microphone simultaneously
- **Scene composition** -- arrange multiple sources with drag-and-drop positioning
- **Canvas presets** -- 16:9, 9:16, 4:3, 1:1, or custom aspect ratios
- **Zoom markers** -- toggle zoom in/out during recording for post-production effects
- **Pause/Resume** -- pause and resume recording without creating multiple files
- **Global shortcuts** -- start, stop, pause, and zoom with configurable hotkeys

### Video Editor
- **Timeline-based editing** -- multi-track video and audio editing
- **Clip operations** -- split, trim, move, duplicate, and delete clips
- **Silence removal** -- automatically detect and remove silent parts with configurable threshold, duration, and padding
- **Effects** -- zoom in/out, fade in/out with customizable parameters
- **Overlays** -- add text and image overlays with positioning and timing
- **Waveform visualization** -- visual audio waveform on the timeline
- **Undo/Redo** -- full action history (up to 50 actions)

### Export
- **Formats** -- MP4 (H.264), MOV (ProRes), WebM (VP9)
- **Presets** -- YouTube 1080p, YouTube 4K, TikTok, Instagram
- **Quality control** -- configurable resolution, CRF, audio bitrate, and frame rate
- **Progress tracking** -- real-time export progress with cancel support

### Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Start/Stop Recording | `Cmd+Shift+R` |
| Pause/Resume Recording | `Cmd+Shift+P` |
| Toggle Zoom (recording) | `Cmd+Shift+Z` |
| Play/Pause | `Space` |
| Split Clip | `S` |
| Delete Clip | `Backspace` / `Delete` |
| Export | `Cmd+E` |
| Undo | `Cmd+Z` |
| Redo | `Cmd+Shift+Z` |
| Select Tool | `V` or `1` |
| Cut Tool | `C` or `2` |
| Text Tool | `T` or `3` |
| Zoom Tool | `Z` or `4` |

All shortcuts are customizable in Settings.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | [Tauri 2](https://tauri.app/) |
| Frontend | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| UI Components | [Radix UI](https://www.radix-ui.com/) |
| State Management | [Zustand](https://zustand-demo.pmnd.rs/) |
| Audio Visualization | [Wavesurfer.js](https://wavesurfer.xyz/) |
| Backend | [Rust](https://www.rust-lang.org/) |
| Video Processing | [FFmpeg](https://ffmpeg.org/) |
| CLI Tool | [Python 3.12](https://www.python.org/) + [Click](https://click.palletsprojects.com/) |

## Prerequisites

Before you begin, make sure you have the following installed:

- **[Node.js](https://nodejs.org/)** (v18 or later)
- **[Rust](https://www.rust-lang.org/tools/install)** (latest stable)
- **[FFmpeg](https://ffmpeg.org/download.html)** -- required for video processing
- **[Python 3.12+](https://www.python.org/)** -- only needed for the CLI tool
- **[uv](https://docs.astral.sh/uv/)** -- Python package manager (only for CLI tool)

### Platform-specific dependencies

<details>
<summary><strong>macOS</strong></summary>

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install FFmpeg via Homebrew
brew install ffmpeg
```

AutoEditor uses macOS Core Graphics APIs for screen capture. macOS 12+ is recommended.

</details>

<details>
<summary><strong>Linux</strong></summary>

Follow the [Tauri prerequisites for Linux](https://v2.tauri.app/start/prerequisites/#linux).

```bash
# Install FFmpeg
sudo apt install ffmpeg  # Debian/Ubuntu
sudo dnf install ffmpeg  # Fedora
```

> **Note:** Screen capture on Linux is experimental.

</details>

<details>
<summary><strong>Windows</strong></summary>

Follow the [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/#windows).

Download FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to your PATH.

> **Note:** Windows support is experimental.

</details>

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/KozielGPC/video-editor-app.git
cd video-editor-app
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run tauri dev
```

This will start the Vite dev server and launch the Tauri application in development mode with hot-reload.

### 4. Build for production

```bash
npm run tauri build
```

The built application will be available in `src-tauri/target/release/bundle/`.

### CLI Tool (optional)

AutoEditor also includes a standalone Python CLI tool for silence removal:

```bash
# Install Python dependencies
uv sync

# Run the CLI
uv run python autoeditor.py video.mp4

# With options
uv run python autoeditor.py video.mp4 -t -45 -d 300 -p 150 -o output.mp4
```

Run `uv run python autoeditor.py --help` for all options.

## Project Structure

```
autoeditor/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # React components
│   │   ├── editor/         # Video editor (timeline, toolbar, preview)
│   │   ├── export/         # Export dialog and presets
│   │   ├── layout/         # App shell, sidebar
│   │   ├── overlays/       # Text and image overlays
│   │   ├── recorder/       # Screen recording UI
│   │   └── settings/       # Settings dialog
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   ├── stores/             # Zustand state stores
│   ├── styles/             # Global styles
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Backend (Rust + Tauri)
│   └── src/
│       ├── commands/       # Tauri command handlers
│       ├── editor/         # Video editing logic (FFmpeg, silence detection)
│       ├── capture/        # Screen capture
│       ├── models/         # Data models
│       └── recording/      # Recording pipeline (encoder, audio, camera)
├── autoeditor.py           # Standalone Python CLI tool
├── package.json            # Node.js dependencies
├── pyproject.toml          # Python dependencies
└── src-tauri/Cargo.toml    # Rust dependencies
```

## Supported Formats

| Type | Formats |
|---|---|
| Video Input | MP4, MOV, MKV, AVI, WebM, M4V |
| Audio Input | MP3, WAV, AAC, FLAC, OGG |
| Image Input | PNG, JPG, JPEG, GIF, WebP |
| Export | MP4 (H.264), MOV (ProRes), WebM (VP9) |

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before getting started.

## License

This project is licensed under the [MIT License](LICENSE).
