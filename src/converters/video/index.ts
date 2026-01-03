import type { ConverterConfig } from '../../types';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let ffmpegLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
  }

  if (!ffmpegLoaded) {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegLoaded = true;
  }

  return ffmpeg;
}

export const videoConverter: ConverterConfig = {
  inputFormats: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'gif'],
  outputFormats: ['mp4', 'webm', 'gif'],

  async convert(file: File, outputFormat: string, onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(5);

    const ff = await getFFmpeg();
    onProgress?.(15);

    const inputExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const inputName = `input_${Date.now()}.${inputExt}`;
    const outputName = `output_${Date.now()}.${outputFormat}`;

    await ff.writeFile(inputName, await fetchFile(file));
    onProgress?.(25);

    // Create progress handler for this specific conversion
    const progressHandler = ({ progress }: { progress: number }) => {
      const scaledProgress = 25 + Math.min(progress, 1) * 65;
      onProgress?.(scaledProgress);
    };

    ff.on('progress', progressHandler);

    try {
      const args = buildFFmpegArgs(inputName, outputName, outputFormat);
      await ff.exec(args);
    } finally {
      ff.off('progress', progressHandler);
    }

    onProgress?.(95);

    const data = await ff.readFile(outputName);

    // Clean up
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    onProgress?.(100);

    return new Blob([data as unknown as BlobPart], { type: getMimeType(outputFormat) });
  },
};

function buildFFmpegArgs(input: string, output: string, format: string): string[] {
  const inputExt = input.split('.').pop()?.toLowerCase() || '';
  const isGifInput = inputExt === 'gif';

  switch (format) {
    case 'mp4':
      if (isGifInput) {
        // GIF to MP4: no audio, need to handle loop and pixel format
        return [
          '-i', input,
          '-movflags', 'faststart',
          '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-an',
          '-y', output
        ];
      }
      // Use libx264 which is widely supported
      return ['-i', input, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', output];
    case 'webm':
      if (isGifInput) {
        // GIF to WebM: no audio
        return [
          '-i', input,
          '-c:v', 'libvpx',
          '-crf', '30',
          '-b:v', '1M',
          '-pix_fmt', 'yuva420p',
          '-an',
          '-y', output
        ];
      }
      // Use libvpx for WebM - simpler settings for better compatibility
      return ['-i', input, '-c:v', 'libvpx', '-crf', '30', '-b:v', '1M', '-c:a', 'libvorbis', '-b:a', '128k', '-y', output];
    case 'gif':
      // Create GIF with palette for better quality
      return [
        '-i', input,
        '-vf', 'fps=10,scale=480:-1:flags=lanczos',
        '-loop', '0',
        '-y', output
      ];
    default:
      return ['-i', input, '-y', output];
  }
}

function getMimeType(format: string): string {
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    gif: 'image/gif',
  };
  return types[format] || 'video/mp4';
}
