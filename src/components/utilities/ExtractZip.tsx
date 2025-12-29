import { useState, useCallback } from 'react';
import { Upload, Download, X, FolderOpen, File as FileIcon } from 'lucide-react';
import JSZip from 'jszip';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

interface ExtractedFile {
  name: string;
  size: number;
  blob: Blob;
}

export function ExtractZip() {
  const { t } = useLanguage();
  const [archive, setArchive] = useState<File | null>(null);
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const loadArchive = useCallback(async (file: File) => {
    setArchive(file);
    setIsProcessing(true);
    setProgress(0);

    try {
      const zip = await JSZip.loadAsync(file);
      const extractedFiles: ExtractedFile[] = [];
      const entries = Object.entries(zip.files).filter(([, f]) => !f.dir);
      let i = 0;

      for (const [name, zipFile] of entries) {
        const content = await zipFile.async('blob');
        extractedFiles.push({ name, size: content.size, blob: content });
        i++;
        setProgress(Math.round((i / entries.length) * 100));
      }

      setFiles(extractedFiles);
    } catch (error) {
      console.error('Extract error:', error);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(zip|rar|7z)$/i.test(file.name)) loadArchive(file);
  }, [loadArchive]);

  const downloadFile = (file: ExtractedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.split('/').pop() || file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    files.forEach((file) => downloadFile(file));
  };

  const reset = () => {
    setArchive(null);
    setFiles([]);
  };

  return (
    <div className="space-y-6">
      {!archive ? (
        <div className="card">
          <label className={`dropzone flex flex-col items-center justify-center min-h-[200px] ${isDragging ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}>
            <input type="file" className="hidden" accept=".zip,.rar,.7z"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadArchive(f); e.target.value = ''; }} />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
            <p className="text-sm text-gray-500">ZIP</p>
          </label>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-8 h-8 text-primary-500" />
                <div>
                  <p className="font-medium text-gray-900">{archive.name}</p>
                  <p className="text-sm text-gray-500">{files.length} {t('zip.files')} - {formatSize(archive.size)}</p>
                </div>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {isProcessing && (
            <div className="card">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-center text-gray-600 mt-2">{t('zip.extracting')} {progress}%</p>
            </div>
          )}

          {files.length > 0 && (
            <>
              <div className="card max-h-[300px] overflow-y-auto">
                <div className="space-y-1">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 px-2 hover:bg-gray-50 rounded">
                      <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                      <span className="text-xs text-gray-400">{formatSize(file.size)}</span>
                      <button onClick={() => downloadFile(file)} className="btn btn-primary text-xs py-1 px-2">
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={downloadAll} className="btn btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t('zip.downloadAll')} ({files.length})
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
