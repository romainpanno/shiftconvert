import { create } from 'zustand';
import type { FileItem, ConversionCategory, ConversionStatus } from '../types';

interface ConversionState {
  files: FileItem[];
  selectedCategory: ConversionCategory | null;
  selectedOutputFormat: string | null;

  // Actions
  addFiles: (files: File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  clearCompletedFiles: () => void;
  updateFileStatus: (id: string, status: ConversionStatus, progress?: number) => void;
  updateFileOutput: (id: string, outputUrl: string, outputName: string, outputFormat: string) => void;
  updateFileError: (id: string, error: string) => void;
  setCategory: (category: ConversionCategory | null) => void;
  setOutputFormat: (format: string | null) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useConversionStore = create<ConversionState>((set) => ({
  files: [],
  selectedCategory: null,
  selectedOutputFormat: null,

  addFiles: (newFiles) => set((state) => ({
    files: [
      ...state.files,
      ...newFiles.map((file) => ({
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'idle' as ConversionStatus,
        progress: 0,
      })),
    ],
  })),

  removeFile: (id) => set((state) => ({
    files: state.files.filter((f) => f.id !== id),
  })),

  clearFiles: () => set({ files: [] }),

  clearCompletedFiles: () => set((state) => {
    // Revoke URLs of completed files to free memory
    state.files.forEach((f) => {
      if (f.status === 'done' && f.outputUrl) {
        URL.revokeObjectURL(f.outputUrl);
      }
    });
    return {
      files: state.files.filter((f) => f.status !== 'done' && f.status !== 'error'),
    };
  }),

  updateFileStatus: (id, status, progress) => set((state) => ({
    files: state.files.map((f) =>
      f.id === id ? { ...f, status, progress: progress ?? f.progress } : f
    ),
  })),

  updateFileOutput: (id, outputUrl, outputName, outputFormat) => set((state) => ({
    files: state.files.map((f) =>
      f.id === id ? { ...f, outputUrl, outputName, outputFormat, status: 'done', progress: 100 } : f
    ),
  })),

  updateFileError: (id, error) => set((state) => ({
    files: state.files.map((f) =>
      f.id === id ? { ...f, error, status: 'error' } : f
    ),
  })),

  setCategory: (category) => set({ selectedCategory: category }),

  setOutputFormat: (format) => set({ selectedOutputFormat: format }),
}));
