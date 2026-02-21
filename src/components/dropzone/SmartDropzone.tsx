import { useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, X, File as FileIcon, ArrowRight,
  Image, FileText, Music, Video, Type,
  Crop, Maximize2, Minimize2, RotateCw,
  Scissors, Volume2, FolderArchive, FolderOpen, QrCode, Merge,
} from 'lucide-react';
import { useConversionStore } from '../../stores/conversionStore';
import { setPendingFiles } from '../../stores/pendingFiles';
import { getConverterConfig } from '../../converters';
import { getUtilitiesByCategory } from '../../utils/utilities';
import { useLanguage } from '../../i18n';
import { formatSize } from '../../utils/formatSize';
import type { UtilityInfo } from '../../utils/utilities';

// Extension → category mapping
const extensionToCategory: Record<string, string> = {
  png: 'images', jpg: 'images', jpeg: 'images', webp: 'images',
  gif: 'images', bmp: 'images', heic: 'images',
  mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  m4a: 'audio', aac: 'audio', wma: 'audio',
  pdf: 'documents', doc: 'documents', docx: 'documents', txt: 'documents',
  csv: 'documents', xlsx: 'documents', xls: 'documents',
  ttf: 'fonts', otf: 'fonts', woff: 'fonts', woff2: 'fonts',
};

const categoryColors: Record<string, string> = {
  images: 'from-pink-500 to-rose-500',
  video: 'from-purple-500 to-violet-500',
  audio: 'from-green-500 to-emerald-500',
  documents: 'from-blue-500 to-cyan-500',
  fonts: 'from-orange-500 to-amber-500',
};

const categoryIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  images: Image,
  documents: FileText,
  audio: Music,
  video: Video,
  fonts: Type,
};

const utilityIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Crop, Maximize2, Minimize2, RotateCw, Scissors,
  Music, Volume2, FolderArchive, FolderOpen, QrCode, FileText, Type,
  Merge,
};

// Utilities that only accept a single file at a time
const SINGLE_FILE_UTILITIES = new Set([
  'image-crop', 'image-resize', 'image-rotate',
  'video-trim', 'video-crop', 'video-resize', 'video-compress', 'video-extract-audio',
  'audio-trim',
  'extract-zip',
]);

interface FileSuggestion {
  category: string;
  extensions: string[];
  files: File[];
  outputFormats: string[];
  utilityTools: UtilityInfo[];
}

export function SmartDropzone() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { addFiles: addToConversionStore, clearFiles } = useConversionStore();
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo<FileSuggestion[]>(() => {
    if (droppedFiles.length === 0) return [];

    const groups = new Map<string, { files: File[]; extensions: Set<string> }>();

    for (const file of droppedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const category = extensionToCategory[ext];
      if (!category) continue;
      if (!groups.has(category)) groups.set(category, { files: [], extensions: new Set() });
      const group = groups.get(category)!;
      group.files.push(file);
      group.extensions.add(ext);
    }

    return Array.from(groups.entries()).map(([category, { files, extensions }]) => {
      const extsArray = Array.from(extensions);
      const config = getConverterConfig(category);

      let outputFormats: string[] = config?.outputFormats ?? [];
      if (config?.formatMap) {
        const formatsPerExt = extsArray.map(
          (ext) => config.formatMap![ext] ?? config.outputFormats
        );
        outputFormats = formatsPerExt.reduce((acc, fmts) => acc.filter((f) => fmts.includes(f)));
      }

      // Remove input formats from suggestions
      const normalizedInputs = new Set(
        extsArray.flatMap((e) =>
          e === 'jpg' ? ['jpg', 'jpeg'] : e === 'jpeg' ? ['jpg', 'jpeg'] : [e]
        )
      );
      outputFormats = outputFormats.filter((f) => !normalizedInputs.has(f));

      return {
        category,
        extensions: extsArray,
        files,
        outputFormats,
        utilityTools: getUtilitiesByCategory(category),
      };
    });
  }, [droppedFiles]);

  const handleFiles = useCallback((files: File[]) => {
    setDroppedFiles(files);
  }, []);

  const handleClear = useCallback(() => {
    setDroppedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) handleFiles(files);
      e.target.value = '';
    },
    [handleFiles]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    fileInputRef.current?.click();
  }, []);

  // Navigate to a converter page, pre-loading files into the Zustand store
  const handleNavigateConvert = useCallback(
    (categoryId: string, files: File[]) => {
      clearFiles();
      addToConversionStore(files);
      navigate(`/convert/${categoryId}`);
    },
    [clearFiles, addToConversionStore, navigate]
  );

  // Navigate to a utility page, pre-loading files via the pending store
  const handleNavigateUtility = useCallback(
    (utilityId: string, files: File[]) => {
      setPendingFiles(files);
      navigate(`/utility/${utilityId}`);
    },
    [navigate]
  );

  // Empty state
  if (droppedFiles.length === 0) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={t('smartdropzone.dropHere')}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer select-none ${
          isDragging
            ? 'border-primary-500 bg-primary-50 scale-[1.01]'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onTouchEnd={handleTouchEnd}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileSelect} />
        <div
          className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center transition-colors ${
            isDragging ? 'bg-primary-100' : 'bg-gray-100'
          }`}
        >
          <Upload
            className={`w-8 h-8 transition-colors ${isDragging ? 'text-primary-500' : 'text-gray-400'}`}
          />
        </div>
        <p className="text-xl font-semibold text-gray-800 mb-2">{t('smartdropzone.dropHere')}</p>
        <p className="text-gray-500 text-sm mb-4">{t('smartdropzone.orClick')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {(['images', 'video', 'audio', 'documents', 'fonts'] as const).map((cat) => {
            const CatIcon = categoryIconMap[cat];
            return (
              <span
                key={cat}
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-gradient-to-br ${categoryColors[cat]} text-white font-medium`}
              >
                {CatIcon && <CatIcon className="w-3 h-3" />}
                {t(`category.${cat}`)}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const isMultiFile = droppedFiles.length > 1;
  const hasUnknown = droppedFiles.some((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    return !extensionToCategory[ext];
  });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* File header */}
      <div className="flex items-start gap-3 p-4 bg-gray-50 border-b border-gray-100">
        <div className="flex-1 min-w-0 flex flex-wrap gap-3">
          {droppedFiles.slice(0, 3).map((file, i) => (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate max-w-[160px] sm:max-w-[240px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
              </div>
            </div>
          ))}
          {droppedFiles.length > 3 && (
            <span className="text-sm text-gray-500 self-center">
              +{droppedFiles.length - 3} {t('smartdropzone.others')}
            </span>
          )}
        </div>
        <button
          onClick={handleClear}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title={t('smartdropzone.change')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {suggestions.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {suggestions.map((suggestion) => {
            const CatIcon = categoryIconMap[suggestion.category];
            return (
              <div key={suggestion.category} className="p-5 sm:p-6">
                {/* Category label */}
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className={`w-8 h-8 rounded-lg bg-gradient-to-br ${categoryColors[suggestion.category]} flex items-center justify-center`}
                  >
                    {CatIcon && <CatIcon className="w-4 h-4 text-white" />}
                  </div>
                  <span className="font-semibold text-gray-900">
                    {t(`category.${suggestion.category}`)}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {suggestion.extensions.map((e) => e.toUpperCase()).join(', ')}
                    {suggestion.files.length > 1 && (
                      <span className="ml-1.5 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                        ×{suggestion.files.length}
                      </span>
                    )}
                  </span>
                </div>

                {/* Conversion formats */}
                {suggestion.outputFormats.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                      {t('smartdropzone.convertTo')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestion.outputFormats.map((format) => (
                        <button
                          key={format}
                          onClick={() =>
                            handleNavigateConvert(suggestion.category, suggestion.files)
                          }
                          className={`group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 active:scale-95 bg-gradient-to-br ${categoryColors[suggestion.category]} text-white shadow-sm hover:shadow-md`}
                        >
                          <span className="opacity-70 text-xs">
                            {suggestion.extensions[0].toUpperCase()}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                          <span>{format.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Utility tools */}
                {suggestion.utilityTools.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
                      {t('smartdropzone.tools')}
                    </p>
                    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
                      {suggestion.utilityTools.map((util) => {
                        const UtilIcon = utilityIconMap[util.icon];
                        const isSingleOnly = SINGLE_FILE_UTILITIES.has(util.id);
                        const showSingleWarning = isMultiFile && isSingleOnly;

                        return (
                          <button
                            key={util.id}
                            onClick={() =>
                              handleNavigateUtility(
                                util.id,
                                // Single-file tools only receive the first file
                                isSingleOnly ? [suggestion.files[0]] : suggestion.files
                              )
                            }
                            className="relative flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-all hover:-translate-y-0.5 text-center"
                          >
                            {showSingleWarning && (
                              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none whitespace-nowrap z-10">
                                1 {t('smartdropzone.fileOnly')}
                              </span>
                            )}
                            <div
                              className={`w-10 h-10 rounded-xl bg-gradient-to-br ${util.color} flex items-center justify-center shadow-sm`}
                            >
                              {UtilIcon && <UtilIcon className="w-5 h-5 text-white" />}
                            </div>
                            <span className="text-xs font-medium text-gray-700 leading-tight">
                              {t(`utility.${util.id}`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="text-gray-500 font-medium">{t('smartdropzone.unsupported')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('smartdropzone.unsupportedDesc')}</p>
        </div>
      )}

      {hasUnknown && suggestions.length > 0 && (
        <div className="px-5 pb-4 text-xs text-amber-600 flex items-center gap-1.5">
          <span>⚠</span>
          <span>{t('smartdropzone.someUnsupported')}</span>
        </div>
      )}
    </div>
  );
}
