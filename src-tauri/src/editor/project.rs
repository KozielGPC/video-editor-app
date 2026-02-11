use crate::models::{ClipData, ProjectData, TrackData};

// ---------------------------------------------------------------------------
// Project creation
// ---------------------------------------------------------------------------

/// Create a new blank project with sensible defaults.
pub fn create_new_project(name: &str, width: u32, height: u32, fps: f64) -> ProjectData {
    ProjectData {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        resolution: (width, height),
        frame_rate: fps,
        tracks: vec![
            TrackData {
                id: uuid::Uuid::new_v4().to_string(),
                track_type: "video".to_string(),
                clips: Vec::new(),
                muted: false,
                locked: false,
            },
            TrackData {
                id: uuid::Uuid::new_v4().to_string(),
                track_type: "audio".to_string(),
                clips: Vec::new(),
                muted: false,
                locked: false,
            },
        ],
        assets: Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/// Serialize project data to a JSON file.
pub fn save_project_to_file(project: &ProjectData, path: &str) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(project).map_err(|e| format!("serialize project: {e}"))?;
    std::fs::write(path, json).map_err(|e| format!("write project: {e}"))
}

/// Deserialize project data from a JSON file.
pub fn load_project_from_file(path: &str) -> Result<ProjectData, String> {
    let data = std::fs::read_to_string(path).map_err(|e| format!("read project: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("parse project: {e}"))
}

// ---------------------------------------------------------------------------
// Track manipulation
// ---------------------------------------------------------------------------

/// Append a new track to the project.
pub fn add_track(project: &mut ProjectData, track_type: &str) -> String {
    let id = uuid::Uuid::new_v4().to_string();
    project.tracks.push(TrackData {
        id: id.clone(),
        track_type: track_type.to_string(),
        clips: Vec::new(),
        muted: false,
        locked: false,
    });
    id
}

// ---------------------------------------------------------------------------
// Clip manipulation
// ---------------------------------------------------------------------------

/// Add a clip to the first matching track (by type) or a specified track id.
pub fn add_clip(project: &mut ProjectData, track_id: &str, clip: ClipData) -> Result<(), String> {
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or_else(|| format!("Track {track_id} not found"))?;

    if track.locked {
        return Err("Track is locked".to_string());
    }

    track.clips.push(clip);
    track.clips.sort_by_key(|c| c.track_position);
    Ok(())
}

/// Remove a clip by id from any track.
pub fn remove_clip(project: &mut ProjectData, clip_id: &str) -> Result<ClipData, String> {
    for track in &mut project.tracks {
        if let Some(pos) = track.clips.iter().position(|c| c.id == clip_id) {
            return Ok(track.clips.remove(pos));
        }
    }
    Err(format!("Clip {clip_id} not found"))
}

/// Split a clip at a given position (ms relative to track).
/// Returns the ids of the two resulting clips.
pub fn split_clip(
    project: &mut ProjectData,
    clip_id: &str,
    split_at_ms: u64,
) -> Result<(String, String), String> {
    // Find the clip
    let (track_idx, clip_idx) = project
        .tracks
        .iter()
        .enumerate()
        .find_map(|(ti, track)| {
            track
                .clips
                .iter()
                .position(|c| c.id == clip_id)
                .map(|ci| (ti, ci))
        })
        .ok_or_else(|| format!("Clip {clip_id} not found"))?;

    let clip = &project.tracks[track_idx].clips[clip_idx];

    // split_at_ms is relative to the clip's track_position
    let offset_in_source = split_at_ms - clip.track_position;
    let split_source_ms = clip.source_start + offset_in_source;

    if split_source_ms <= clip.source_start || split_source_ms >= clip.source_end {
        return Err("Split point outside clip range".to_string());
    }

    let id_left = uuid::Uuid::new_v4().to_string();
    let id_right = uuid::Uuid::new_v4().to_string();

    let left = ClipData {
        id: id_left.clone(),
        asset_id: clip.asset_id.clone(),
        track_position: clip.track_position,
        source_start: clip.source_start,
        source_end: split_source_ms,
        volume: clip.volume,
        effects: clip.effects.clone(),
        overlays: clip.overlays.clone(),
    };

    let right = ClipData {
        id: id_right.clone(),
        asset_id: clip.asset_id.clone(),
        track_position: split_at_ms,
        source_start: split_source_ms,
        source_end: clip.source_end,
        volume: clip.volume,
        effects: clip.effects.clone(),
        overlays: clip.overlays.clone(),
    };

    let track = &mut project.tracks[track_idx];
    track.clips.remove(clip_idx);
    track.clips.push(left);
    track.clips.push(right);
    track.clips.sort_by_key(|c| c.track_position);

    Ok((id_left, id_right))
}

/// Move a clip to a new track position (in ms).
pub fn move_clip(
    project: &mut ProjectData,
    clip_id: &str,
    new_position: u64,
) -> Result<(), String> {
    for track in &mut project.tracks {
        if let Some(clip) = track.clips.iter_mut().find(|c| c.id == clip_id) {
            clip.track_position = new_position;
            break;
        }
    }
    // Re-sort clips on every track
    for track in &mut project.tracks {
        track.clips.sort_by_key(|c| c.track_position);
    }
    Ok(())
}
