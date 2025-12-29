export type ConversionCategory = 'images' | 'documents' | 'audio' | 'video' | 'fonts' | 'archives';

export type ConversionStatus = 'idle' | 'loading' | 'converting' | 'done' | 'error';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: ConversionStatus;
  progress: number;
  outputUrl?: string;
  outputName?: string;
  outputFormat?: string;
  error?: string;
}

export interface ConversionOption {
  id: string;
  label: string;
  fromFormats: string[];
  toFormats: string[];
  category: ConversionCategory;
  description?: string;
}

export interface CategoryInfo {
  id: ConversionCategory;
  labelKey: string;
  descriptionKey: string;
  limitationsKey?: string;
  icon: string;
  color: string;
}

export interface ConverterConfig {
  inputFormats: string[];
  outputFormats: string[];
  // Optional mapping: input format -> available output formats
  // If not provided, all outputFormats are available for all inputs
  formatMap?: Record<string, string[]>;
  convert: (file: File, outputFormat: string, onProgress?: (progress: number) => void) => Promise<Blob>;
}
