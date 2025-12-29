import type { ConverterConfig } from '../types';
import { imageConverter } from './images';
import { documentConverter } from './documents';
import { audioConverter } from './audio';
import { videoConverter } from './video';
import { fontConverter } from './fonts';

const converters: Record<string, ConverterConfig> = {
  images: imageConverter,
  documents: documentConverter,
  audio: audioConverter,
  video: videoConverter,
  fonts: fontConverter,
};

export function getConverterConfig(category: string): ConverterConfig | null {
  return converters[category] || null;
}

export function getAllConverters() {
  return converters;
}
