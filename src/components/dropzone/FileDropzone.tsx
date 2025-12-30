import { useCallback, useState } from 'react';
import { Upload, File as FileIcon, Download, X, AlertCircle } from 'lucide-react';
import { useConversionStore } from '../../stores/conversionStore';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';
import type { FileItem } from '../../types';

interface FileDropzoneProps {
  acceptedFormats?: string[];
}

// MIME types mapping for better browser compatibility
const mimeTypes: Record<string, string> = {
  // Fonts
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  eot: 'application/vnd.ms-fontobject',
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  // Documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

export function FileDropzone({ acceptedFormats }: FileDropzoneProps) {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const { addFiles, files, clearCompletedFiles } = useConversionStore();

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

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        // Clear completed files before adding new ones
        clearCompletedFiles();
        addFiles(droppedFiles);
      }
    },
    [addFiles, clearCompletedFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
      if (selectedFiles.length > 0) {
        // Clear completed files before adding new ones
        clearCompletedFiles();
        addFiles(selectedFiles);
      }
      e.target.value = '';
    },
    [addFiles, clearCompletedFiles]
  );

  // Build accept string with both extensions and MIME types for better browser compatibility
  const acceptString = acceptedFormats
    ?.flatMap((f) => {
      const ext = `.${f}`;
      const mime = mimeTypes[f.toLowerCase()];
      return mime ? [ext, mime] : [ext];
    })
    .join(',');

  return (
    <div className="space-y-4">
      <label
        className={`dropzone flex flex-col items-center justify-center min-h-[200px] ${
          isDragging ? 'active' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          multiple
          accept={acceptString}
          onChange={handleFileSelect}
        />
        <Upload className="w-12 h-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-1">
          {t('dropzone.dragHere')}
        </p>
        <p className="text-sm text-gray-500">
          {t('dropzone.orClick')}
        </p>
        {acceptedFormats && (
          <p className="text-xs text-gray-400 mt-2">
            {t('dropzone.accepted')} : {acceptedFormats.join(', ').toUpperCase()}
          </p>
        )}
      </label>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <FilePreview key={file.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilePreview({ file }: { file: FileItem }) {
  const { t } = useLanguage();
  const { removeFile } = useConversionStore();

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 bg-white rounded-lg border border-gray-200">
      <FileIcon className="w-8 h-8 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
        <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
      </div>

      <button
        onClick={() => removeFile(file.id)}
        className="text-gray-400 hover:text-red-500 p-1.5 transition-colors sm:order-last"
        title={t('dropzone.remove')}
      >
        <X className="w-5 h-5 sm:w-4 sm:h-4" />
      </button>

      {file.status === 'converting' && (
        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <div className="flex-1 sm:w-24 sm:flex-none">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${file.progress}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-gray-500 w-10">{Math.round(file.progress)}%</span>
        </div>
      )}

      {file.status === 'done' && file.outputUrl && (
        <a
          href={file.outputUrl}
          download={file.outputName}
          className="btn btn-primary text-sm flex items-center gap-1.5 w-full sm:w-auto justify-center mt-2 sm:mt-0"
        >
          <Download className="w-3.5 h-3.5" />
          {file.outputFormat?.toUpperCase() || t('common.download')}
        </a>
      )}

      {file.status === 'error' && (
        <div className="flex items-center gap-1.5 text-red-600 w-full sm:w-auto mt-2 sm:mt-0">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm truncate">{file.error || t('common.error')}</span>
        </div>
      )}
    </div>
  );
}
