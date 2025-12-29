export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
}

export function changeExtension(filename: string, newExt: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return `${filename}.${newExt}`;
  return `${filename.slice(0, lastDot)}.${newExt}`;
}
