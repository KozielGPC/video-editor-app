/**
 * Convert a local filesystem path to a stream:// URL served by our custom
 * Tauri protocol handler. This supports Range requests for video seeking.
 */
export function streamUrl(filePath: string): string {
  const encoded = encodeURIComponent(filePath);
  return `stream://localhost/${encoded}`;
}
