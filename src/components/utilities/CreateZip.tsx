import { useState, useCallback } from 'react';
import { Upload, Download, X, FolderArchive } from 'lucide-react';
import JSZip from 'jszip';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

export function CreateZip() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zipName, setZipName] = useState('archive');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateZip = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      const zip = new JSZip();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const content = await file.arrayBuffer();
        zip.file(file.name, content);
        setProgress(Math.round(((i + 1) / files.length) * 50));
      }

      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => setProgress(50 + Math.round(metadata.percent / 2))
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('ZIP error:', error);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="space-y-6">
      <div className="card">
        <label className={`dropzone flex flex-col items-center justify-center min-h-[150px] ${isDragging ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}>
          <input type="file" className="hidden" multiple
            onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          <Upload className="w-10 h-10 text-gray-400 mb-3" />
          <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
          <p className="text-sm text-gray-500">{t('zip.allFileTypes')}</p>
        </label>
      </div>

      {files.length > 0 && (
        <>
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('zip.archiveName')}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={zipName}
                onChange={(e) => setZipName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
                placeholder="archive"
              />
              <span className="text-gray-500">.zip</span>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderArchive className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">{files.length} {t('zip.files')}</span>
              </div>
              <span className="text-sm text-gray-500">{formatSize(totalSize)}</span>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded">
                  <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
                  <span className="text-xs text-gray-400 mx-2">{formatSize(file.size)}</span>
                  <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {isProcessing && (
            <div className="card">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-center text-gray-600 mt-2">{progress}%</p>
            </div>
          )}

          <button onClick={handleCreateZip} disabled={isProcessing} className="btn btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isProcessing ? t('zip.creating') : t('zip.createZip')}
          </button>
        </>
      )}
    </div>
  );
}
