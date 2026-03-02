use crate::models::{AutoZoomConfig, MouseClickEvent, ZoomMarker};

/// Generate auto-zoom markers from click events using density-based clustering.
///
/// Algorithm:
/// 1. Sort clicks by timestamp
/// 2. Sliding window: for each click, find all clicks within `time_window_ms`
/// 3. Spatial filter: keep only clicks within `spatial_threshold_px` Euclidean distance
/// 4. If cluster size >= `min_clicks`, form a zoom marker
/// 5. Merge overlapping clusters
/// 6. Generate `ZoomMarker` for each cluster
pub fn generate_auto_zoom(
    clicks: &[MouseClickEvent],
    config: &AutoZoomConfig,
    screen_width: f64,
    screen_height: f64,
) -> Vec<ZoomMarker> {
    if clicks.is_empty() {
        return Vec::new();
    }

    // Sort clicks by timestamp
    let mut sorted_clicks: Vec<&MouseClickEvent> = clicks.iter().collect();
    sorted_clicks.sort_by_key(|c| c.timestamp_ms);

    // Step 1: Find clusters using sliding window + spatial filter
    let mut clusters: Vec<Vec<&MouseClickEvent>> = Vec::new();

    for (i, click) in sorted_clicks.iter().enumerate() {
        // Find all clicks within time_window_ms of this click
        let mut window_clicks: Vec<&MouseClickEvent> = vec![click];

        for j in (i + 1)..sorted_clicks.len() {
            let other = sorted_clicks[j];
            if other.timestamp_ms - click.timestamp_ms > config.time_window_ms {
                break;
            }
            // Spatial filter: check Euclidean distance
            let dx = other.x - click.x;
            let dy = other.y - click.y;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= config.spatial_threshold_px {
                window_clicks.push(other);
            }
        }

        if window_clicks.len() >= config.min_clicks as usize {
            clusters.push(window_clicks);
        }
    }

    if clusters.is_empty() {
        return Vec::new();
    }

    // Step 2: Merge overlapping clusters
    let merged = merge_clusters(&clusters, config);

    // Step 3: Generate ZoomMarkers
    merged
        .into_iter()
        .map(|cluster| {
            let earliest = cluster.iter().map(|c| c.timestamp_ms).min().unwrap_or(0);
            let latest = cluster.iter().map(|c| c.timestamp_ms).max().unwrap_or(0);

            // Compute mean position as percentage of screen dimensions
            let n = cluster.len() as f64;
            let mean_x = cluster.iter().map(|c| c.x).sum::<f64>() / n;
            let mean_y = cluster.iter().map(|c| c.y).sum::<f64>() / n;

            let x_pct = (mean_x / screen_width * 100.0).clamp(0.0, 100.0);
            let y_pct = (mean_y / screen_height * 100.0).clamp(0.0, 100.0);

            let start_ms = earliest.saturating_sub(config.ramp_in_ms);
            let end_ms = latest + config.hold_after_ms + config.ramp_out_ms;

            ZoomMarker {
                start_ms,
                end_ms,
                x: x_pct,
                y: y_pct,
                scale: config.scale,
                positions: Vec::new(),
            }
        })
        .collect()
}

/// Merge overlapping clusters by checking if any clicks are shared or
/// if the time ranges overlap.
fn merge_clusters<'a>(
    clusters: &[Vec<&'a MouseClickEvent>],
    config: &AutoZoomConfig,
) -> Vec<Vec<&'a MouseClickEvent>> {
    if clusters.is_empty() {
        return Vec::new();
    }

    // Convert to ranges with click sets for merging
    struct ClusterRange<'a> {
        start_ms: u64,
        end_ms: u64,
        clicks: Vec<&'a MouseClickEvent>,
    }

    let mut ranges: Vec<ClusterRange<'a>> = clusters
        .iter()
        .map(|cluster| {
            let earliest = cluster.iter().map(|c| c.timestamp_ms).min().unwrap_or(0);
            let latest = cluster.iter().map(|c| c.timestamp_ms).max().unwrap_or(0);
            ClusterRange {
                start_ms: earliest.saturating_sub(config.ramp_in_ms),
                end_ms: latest + config.hold_after_ms + config.ramp_out_ms,
                clicks: cluster.clone(),
            }
        })
        .collect();

    ranges.sort_by_key(|r| r.start_ms);

    let mut merged: Vec<ClusterRange<'a>> = vec![ranges.remove(0)];

    for range in ranges {
        let last = merged.last_mut().unwrap();
        if range.start_ms <= last.end_ms {
            // Overlapping — merge
            last.end_ms = last.end_ms.max(range.end_ms);
            // Union of clicks (deduplicate by timestamp+position)
            for click in range.clicks {
                let already_present = last.clicks.iter().any(|c| {
                    c.timestamp_ms == click.timestamp_ms
                        && (c.x - click.x).abs() < 0.01
                        && (c.y - click.y).abs() < 0.01
                });
                if !already_present {
                    last.clicks.push(click);
                }
            }
        } else {
            merged.push(range);
        }
    }

    merged.into_iter().map(|r| r.clicks).collect()
}
