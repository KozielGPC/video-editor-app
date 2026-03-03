/**
 * Path resolution utilities for project file management.
 *
 * Project files use relative paths (relative to the project directory)
 * for portability. These helpers convert between relative and absolute.
 */

/** Join a project directory with a relative path to get an absolute path. */
export function resolveAssetPath(projectDir: string, relativePath: string): string {
  if (relativePath.startsWith("/")) return relativePath; // already absolute
  const dir = projectDir.endsWith("/") ? projectDir : `${projectDir}/`;
  return `${dir}${relativePath}`;
}

/** Strip the project directory prefix from an absolute path to get a relative path. */
export function makeRelativePath(projectDir: string, absolutePath: string): string {
  const dir = projectDir.endsWith("/") ? projectDir : `${projectDir}/`;
  if (absolutePath.startsWith(dir)) {
    return absolutePath.slice(dir.length);
  }
  return absolutePath; // can't make relative, return as-is
}
