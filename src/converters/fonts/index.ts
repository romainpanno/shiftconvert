import type { ConverterConfig } from '../../types';
import { Font } from 'fonteditor-core';
import { compress as woff2Compress, decompress as woff2Decompress } from 'wawoff2';

export interface FontMetadata {
  fontFamily: string;
  fontSubFamily: string;
  fullName: string;
  version: string;
  copyright: string;
  designer: string;
  description: string;
  license: string;
  trademark: string;
}

export const fontConverter: ConverterConfig = {
  inputFormats: ['ttf', 'otf', 'woff', 'eot'],
  outputFormats: ['ttf', 'otf', 'woff', 'woff2'],

  async convert(file: File, outputFormat: string, onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(10);

    const inputFormat = file.name.split('.').pop()?.toLowerCase() || 'ttf';
    const buffer = await file.arrayBuffer();

    onProgress?.(20);

    // Handle WOFF2 input - decompress to TTF first
    let fontBuffer: ArrayBuffer;
    let actualInputFormat = inputFormat;

    if (inputFormat === 'woff2') {
      const decompressed = await woff2Decompress(new Uint8Array(buffer));
      fontBuffer = decompressed.buffer.slice(0) as ArrayBuffer;
      actualInputFormat = 'ttf';
    } else {
      fontBuffer = buffer;
    }

    onProgress?.(40);

    const font = Font.create(fontBuffer, {
      type: actualInputFormat as 'ttf' | 'otf' | 'woff' | 'eot',
    });

    onProgress?.(60);

    // Handle WOFF2 output - convert to TTF first, then compress
    if (outputFormat === 'woff2') {
      const ttfBuffer = font.write({
        type: 'ttf',
        hinting: true,
      });

      onProgress?.(80);

      const woff2Buffer = await woff2Compress(new Uint8Array(ttfBuffer as ArrayBuffer));

      onProgress?.(100);

      return new Blob([new Uint8Array(woff2Buffer)], { type: 'font/woff2' });
    }

    // Standard conversion for other formats
    const outputBuffer = font.write({
      type: outputFormat as 'ttf' | 'otf' | 'woff',
      hinting: true,
    });

    onProgress?.(100);

    return new Blob([new Uint8Array(outputBuffer as ArrayBuffer)], { type: getMimeType(outputFormat) });
  },
};

export async function readFontMetadata(file: File): Promise<FontMetadata> {
  const inputFormat = file.name.split('.').pop()?.toLowerCase() || 'ttf';
  const buffer = await file.arrayBuffer();

  // Handle WOFF2 input
  let fontBuffer: ArrayBuffer;
  let actualInputFormat = inputFormat;

  if (inputFormat === 'woff2') {
    const decompressed = await woff2Decompress(new Uint8Array(buffer));
    fontBuffer = decompressed.buffer.slice(0) as ArrayBuffer;
    actualInputFormat = 'ttf';
  } else {
    fontBuffer = buffer;
  }

  const font = Font.create(fontBuffer, {
    type: actualInputFormat as 'ttf' | 'otf' | 'woff' | 'eot',
  });

  const name = font.data.name || {};

  return {
    fontFamily: name.fontFamily || '',
    fontSubFamily: name.fontSubFamily || '',
    fullName: name.fullName || '',
    version: name.version || '',
    copyright: name.copyright || '',
    designer: name.designer || '',
    description: name.description || '',
    license: name.licence || '',
    trademark: name.tradeMark || '',
  };
}

export async function convertFontWithMetadata(
  file: File,
  outputFormat: string,
  metadata: Partial<FontMetadata>,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  onProgress?.(10);

  const inputFormat = file.name.split('.').pop()?.toLowerCase() || 'ttf';
  const buffer = await file.arrayBuffer();

  onProgress?.(20);

  // Handle WOFF2 input - decompress to TTF first
  let fontBuffer: ArrayBuffer;
  let actualInputFormat = inputFormat;

  if (inputFormat === 'woff2') {
    const decompressed = await woff2Decompress(new Uint8Array(buffer));
    fontBuffer = decompressed.buffer.slice(0) as ArrayBuffer;
    actualInputFormat = 'ttf';
  } else {
    fontBuffer = buffer;
  }

  onProgress?.(30);

  const font = Font.create(fontBuffer, {
    type: actualInputFormat as 'ttf' | 'otf' | 'woff' | 'eot',
  });

  onProgress?.(50);

  const nameTable = font.data.name as Record<string, string>;
  if (nameTable) {
    if (metadata.fontFamily) nameTable.fontFamily = metadata.fontFamily;
    if (metadata.fontSubFamily) nameTable.fontSubFamily = metadata.fontSubFamily;
    if (metadata.fullName) nameTable.fullName = metadata.fullName;
    if (metadata.version) nameTable.version = metadata.version;
    if (metadata.copyright) nameTable.copyright = metadata.copyright;
    if (metadata.designer) nameTable.designer = metadata.designer;
    if (metadata.description) nameTable.description = metadata.description;
    if (metadata.license) nameTable.licence = metadata.license;
    if (metadata.trademark) nameTable.tradeMark = metadata.trademark;
  }

  onProgress?.(60);

  // Handle WOFF2 output - convert to TTF first, then compress
  if (outputFormat === 'woff2') {
    const ttfBuffer = font.write({
      type: 'ttf',
      hinting: true,
    });

    onProgress?.(80);

    const woff2Buffer = await woff2Compress(new Uint8Array(ttfBuffer as ArrayBuffer));

    onProgress?.(100);

    return new Blob([new Uint8Array(woff2Buffer)], { type: 'font/woff2' });
  }

  // Standard conversion for other formats
  const outputBuffer = font.write({
    type: outputFormat as 'ttf' | 'otf' | 'woff',
    hinting: true,
  });

  onProgress?.(100);

  return new Blob([new Uint8Array(outputBuffer as ArrayBuffer)], { type: getMimeType(outputFormat) });
}

function getMimeType(format: string): string {
  const types: Record<string, string> = {
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
  };
  return types[format] || 'application/octet-stream';
}
