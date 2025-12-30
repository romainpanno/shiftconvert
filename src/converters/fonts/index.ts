import type { ConverterConfig } from '../../types';
import { Font } from 'fonteditor-core';
import { compress as woff2Compress, decompress as woff2Decompress } from 'wawoff2';

export interface FontMetadata {
  // Basic info
  fontFamily: string;
  fontSubFamily: string;
  fullName: string;
  version: string;
  postScriptName: string;
  uniqueSubFamily: string;
  // Creator info
  copyright: string;
  trademark: string;
  manufacturer: string;
  designer: string;
  description: string;
  // URLs
  urlVendor: string;
  urlDesigner: string;
  // License
  license: string;
  licenseUrl: string;
  // Extended
  preferredFamily: string;
  preferredSubFamily: string;
  compatibleFull: string;
  sampleText: string;
}

export const fontConverter: ConverterConfig = {
  inputFormats: ['ttf', 'otf', 'woff'],
  outputFormats: ['ttf', 'otf', 'woff'],

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

  const name = (font.data.name || {}) as Record<string, string>;

  return {
    // Basic info
    fontFamily: name.fontFamily || '',
    fontSubFamily: name.fontSubFamily || '',
    fullName: name.fullName || '',
    version: name.version || '',
    postScriptName: name.postScriptName || '',
    uniqueSubFamily: name.uniqueSubFamily || '',
    // Creator info
    copyright: name.copyright || '',
    trademark: name.tradeMark || '',
    manufacturer: name.manufacturer || '',
    designer: name.designer || '',
    description: name.description || '',
    // URLs
    urlVendor: name.urlVendor || '',
    urlDesigner: name.urlDesigner || '',
    // License
    license: name.licence || '',
    licenseUrl: name.licenceUrl || '',
    // Extended
    preferredFamily: name.preferredFamily || '',
    preferredSubFamily: name.preferredSubFamily || '',
    compatibleFull: name.compatibleFull || '',
    sampleText: name.sampleText || '',
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
    // Basic info
    if (metadata.fontFamily) nameTable.fontFamily = metadata.fontFamily;
    if (metadata.fontSubFamily) nameTable.fontSubFamily = metadata.fontSubFamily;
    if (metadata.fullName) nameTable.fullName = metadata.fullName;
    if (metadata.version) nameTable.version = metadata.version;
    if (metadata.postScriptName) nameTable.postScriptName = metadata.postScriptName;
    if (metadata.uniqueSubFamily) nameTable.uniqueSubFamily = metadata.uniqueSubFamily;
    // Creator info
    if (metadata.copyright) nameTable.copyright = metadata.copyright;
    if (metadata.trademark) nameTable.tradeMark = metadata.trademark;
    if (metadata.manufacturer) nameTable.manufacturer = metadata.manufacturer;
    if (metadata.designer) nameTable.designer = metadata.designer;
    if (metadata.description) nameTable.description = metadata.description;
    // URLs
    if (metadata.urlVendor) nameTable.urlVendor = metadata.urlVendor;
    if (metadata.urlDesigner) nameTable.urlDesigner = metadata.urlDesigner;
    // License
    if (metadata.license) nameTable.licence = metadata.license;
    if (metadata.licenseUrl) nameTable.licenceUrl = metadata.licenseUrl;
    // Extended
    if (metadata.preferredFamily) nameTable.preferredFamily = metadata.preferredFamily;
    if (metadata.preferredSubFamily) nameTable.preferredSubFamily = metadata.preferredSubFamily;
    if (metadata.compatibleFull) nameTable.compatibleFull = metadata.compatibleFull;
    if (metadata.sampleText) nameTable.sampleText = metadata.sampleText;
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
