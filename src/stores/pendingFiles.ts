/**
 * Simple module-level store to pass files from SmartDropzone to utility pages.
 * Files are consumed once on mount — subsequent reads return an empty array.
 */
let _pendingFiles: File[] = [];

export function setPendingFiles(files: File[]): void {
  _pendingFiles = [...files];
}

export function consumePendingFiles(): File[] {
  const files = _pendingFiles;
  _pendingFiles = [];
  return files;
}
