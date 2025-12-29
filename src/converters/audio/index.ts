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

export const audioConverter: ConverterConfig = {
  inputFormats: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'],
  outputFormats: ['mp3', 'wav', 'ogg', 'flac'],

  async convert(file: File, outputFormat: string, onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(5);

    const ff = await getFFmpeg();
    onProgress?.(20);

    const inputExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const inputName = `input_${Date.now()}.${inputExt}`;
    const outputName = `output_${Date.now()}.${outputFormat}`;

    await ff.writeFile(inputName, await fetchFile(file));
    onProgress?.(40);

    // Create progress handler for this specific conversion
    const progressHandler = ({ progress }: { progress: number }) => {
      // Clamp progress between 40-95%
      const scaledProgress = 40 + Math.min(progress, 1) * 55;
      onProgress?.(scaledProgress);
    };

    ff.on('progress', progressHandler);

    try {
      const codecArgs = getCodecArgs(outputFormat);
      await ff.exec(['-i', inputName, ...codecArgs, '-y', outputName]);
    } finally {
      // Remove the progress listener after conversion
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

function getCodecArgs(format: string): string[] {
  switch (format) {
    case 'mp3':
      return ['-acodec', 'libmp3lame', '-q:a', '2'];
    case 'wav':
      return ['-acodec', 'pcm_s16le'];
    case 'ogg':
      return ['-acodec', 'libvorbis', '-q:a', '4'];
    case 'flac':
      return ['-acodec', 'flac'];
    default:
      return [];
  }
}

function getMimeType(format: string): string {
  const types: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return types[format] || 'audio/mpeg';
}
