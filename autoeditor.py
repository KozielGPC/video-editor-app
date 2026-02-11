"""Automatic video editor that detects and removes silent parts."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import click
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeElapsedColumn

console = Console()

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

DEFAULT_SILENCE_THRESHOLD_DB = -50
DEFAULT_MIN_SILENCE_DURATION_MS = 200
DEFAULT_PADDING_MS = 100


@dataclass(frozen=True)
class Segment:
    """A time range to keep in the final video (in milliseconds)."""

    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    @property
    def start_seconds(self) -> float:
        return self.start_ms / 1000.0

    @property
    def end_seconds(self) -> float:
        return self.end_ms / 1000.0


@dataclass(frozen=True)
class EditorConfig:
    """Configuration for the silence removal pipeline."""

    input_path: Path
    output_path: Path
    silence_threshold_db: int
    min_silence_duration_ms: int
    padding_ms: int


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------


def check_ffmpeg_installed() -> None:
    """Verify that FFmpeg is available on PATH."""
    if shutil.which("ffmpeg") is None:
        console.print("[bold red]Error:[/] FFmpeg is not installed or not found in PATH.")
        console.print("Install it with: [bold]brew install ffmpeg[/] (macOS)")
        raise SystemExit(1)


def get_video_duration_ms(video_path: Path) -> int:
    """Return the total duration of a video file in milliseconds."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            str(video_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(result.stdout)
    duration_seconds = float(info["format"]["duration"])
    return int(duration_seconds * 1000)


def extract_audio(video_path: Path, audio_path: Path) -> None:
    """Extract audio from a video file to a WAV file."""
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            str(audio_path),
        ],
        capture_output=True,
        check=True,
    )


# ---------------------------------------------------------------------------
# Silence detection
# ---------------------------------------------------------------------------


def detect_nonsilent_segments(
    audio_path: Path,
    silence_threshold_db: int,
    min_silence_duration_ms: int,
) -> list[tuple[int, int]]:
    """Detect non-silent ranges in an audio file.

    Returns a list of (start_ms, end_ms) tuples.
    """
    audio = AudioSegment.from_wav(str(audio_path))
    ranges = detect_nonsilent(
        audio,
        min_silence_len=min_silence_duration_ms,
        silence_thresh=silence_threshold_db,
    )
    return ranges


# ---------------------------------------------------------------------------
# Segment calculation
# ---------------------------------------------------------------------------


def build_segments(
    nonsilent_ranges: list[tuple[int, int]],
    total_duration_ms: int,
    padding_ms: int,
) -> list[Segment]:
    """Convert raw non-silent ranges into padded, merged segments.

    Adds padding around each range so cuts don't feel abrupt,
    then merges any overlapping segments.
    """
    if not nonsilent_ranges:
        return []
    padded: list[Segment] = []
    for start, end in nonsilent_ranges:
        padded_start = max(0, start - padding_ms)
        padded_end = min(total_duration_ms, end + padding_ms)
        padded.append(Segment(start_ms=padded_start, end_ms=padded_end))
    return merge_overlapping_segments(padded)


def merge_overlapping_segments(segments: list[Segment]) -> list[Segment]:
    """Merge segments that overlap or are adjacent."""
    if not segments:
        return []
    sorted_segments = sorted(segments, key=lambda s: s.start_ms)
    merged: list[Segment] = [sorted_segments[0]]
    for current in sorted_segments[1:]:
        previous = merged[-1]
        if current.start_ms <= previous.end_ms:
            merged[-1] = Segment(
                start_ms=previous.start_ms,
                end_ms=max(previous.end_ms, current.end_ms),
            )
        else:
            merged.append(current)
    return merged


# ---------------------------------------------------------------------------
# Video assembly
# ---------------------------------------------------------------------------


def assemble_video(
    input_path: Path,
    output_path: Path,
    segments: list[Segment],
) -> None:
    """Build the final video by trimming and concatenating non-silent segments.

    Uses FFmpeg's filter_complex with trim/atrim filters and concat.
    """
    if not segments:
        console.print("[bold yellow]Warning:[/] No non-silent segments found. Nothing to output.")
        return
    filter_parts: list[str] = []
    concat_inputs: list[str] = []
    for i, segment in enumerate(segments):
        video_label = f"v{i}"
        audio_label = f"a{i}"
        filter_parts.append(
            f"[0:v]trim=start={segment.start_seconds:.3f}:end={segment.end_seconds:.3f},"
            f"setpts=PTS-STARTPTS[{video_label}]"
        )
        filter_parts.append(
            f"[0:a]atrim=start={segment.start_seconds:.3f}:end={segment.end_seconds:.3f},"
            f"asetpts=PTS-STARTPTS[{audio_label}]"
        )
        concat_inputs.append(f"[{video_label}][{audio_label}]")
    segment_count = len(segments)
    concat_filter = "".join(concat_inputs) + f"concat=n={segment_count}:v=1:a=1[outv][outa]"
    filter_parts.append(concat_filter)
    filter_complex = ";\n".join(filter_parts)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i", str(input_path),
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "[outa]",
            str(output_path),
        ],
        capture_output=True,
        check=True,
    )


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------


def run_pipeline(config: EditorConfig) -> None:
    """Execute the full silence-removal pipeline."""
    check_ffmpeg_installed()
    if not config.input_path.exists():
        console.print(f"[bold red]Error:[/] Input file not found: {config.input_path}")
        raise SystemExit(1)
    with tempfile.TemporaryDirectory() as tmp_dir:
        audio_path = Path(tmp_dir) / "audio.wav"
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            # Step 1: Extract audio
            task = progress.add_task("Extracting audio...", total=None)
            extract_audio(config.input_path, audio_path)
            progress.update(task, completed=True, description="Audio extracted")
            # Step 2: Get video duration
            total_duration_ms = get_video_duration_ms(config.input_path)
            # Step 3: Detect silence
            task = progress.add_task("Detecting silent regions...", total=None)
            nonsilent_ranges = detect_nonsilent_segments(
                audio_path,
                config.silence_threshold_db,
                config.min_silence_duration_ms,
            )
            progress.update(task, completed=True, description="Silence detected")
            # Step 4: Calculate segments
            segments = build_segments(
                nonsilent_ranges,
                total_duration_ms,
                config.padding_ms,
            )
            # Step 5: Report
            silent_duration_ms = total_duration_ms - sum(s.duration_ms for s in segments)
            console.print(
                f"\n  Found [bold]{len(nonsilent_ranges)}[/] non-silent regions, "
                f"removing [bold]{silent_duration_ms / 1000:.1f}s[/] of silence "
                f"from [bold]{total_duration_ms / 1000:.1f}s[/] total.\n"
            )
            if not segments:
                console.print("[bold yellow]No content to keep. Aborting.[/]")
                return
            # Step 6: Assemble video
            task = progress.add_task("Assembling video...", total=None)
            assemble_video(config.input_path, config.output_path, segments)
            progress.update(task, completed=True, description="Video assembled")
    console.print(f"\n[bold green]Done![/] Output saved to: {config.output_path}\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_output_path(input_path: Path, output: str | None) -> Path:
    """Generate the output path, defaulting to `<input>_edited.<ext>`."""
    if output:
        return Path(output)
    stem = input_path.stem
    suffix = input_path.suffix
    return input_path.parent / f"{stem}_edited{suffix}"


@click.command()
@click.argument("input_file", type=click.Path(exists=True))
@click.option("-o", "--output", default=None, help="Output file path (default: <input>_edited.<ext>).")
@click.option(
    "-t", "--threshold",
    default=DEFAULT_SILENCE_THRESHOLD_DB,
    type=int,
    show_default=True,
    help="Silence threshold in dBFS.",
)
@click.option(
    "-d", "--min-duration",
    default=DEFAULT_MIN_SILENCE_DURATION_MS,
    type=int,
    show_default=True,
    help="Minimum silence duration in milliseconds to remove.",
)
@click.option(
    "-p", "--padding",
    default=DEFAULT_PADDING_MS,
    type=int,
    show_default=True,
    help="Padding in milliseconds to keep around each cut.",
)
def main(
    input_file: str,
    output: str | None,
    threshold: int,
    min_duration: int,
    padding: int,
) -> None:
    """Automatically remove silent parts from a video file."""
    input_path = Path(input_file)
    output_path = build_output_path(input_path, output)
    config = EditorConfig(
        input_path=input_path,
        output_path=output_path,
        silence_threshold_db=threshold,
        min_silence_duration_ms=min_duration,
        padding_ms=padding,
    )
    console.print(f"\n[bold]Auto Editor[/] - Silence Remover\n")
    console.print(f"  Input:          {config.input_path}")
    console.print(f"  Output:         {config.output_path}")
    console.print(f"  Threshold:      {config.silence_threshold_db} dBFS")
    console.print(f"  Min silence:    {config.min_silence_duration_ms} ms")
    console.print(f"  Padding:        {config.padding_ms} ms\n")
    run_pipeline(config)


if __name__ == "__main__":
    main()
