import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X, Volume2 } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

export function AudioNormalize() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [targetDb, setTargetDb] = useState(-14);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const audioFiles = newFiles.filter((f) => /^audio\//i.test(f.type));
    setFiles((prev) => [...prev, ...audioFiles.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleNormalize = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProgress(0);

    try {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
        await ffmpegRef.current.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        });
      }

      const ff = ffmpegRef.current;

      for (let i = 0; i < files.length; i++) {
        const { file } = files[i];
        setCurrentFile(file.name);
        setProgress(Math.round((i / files.length) * 100));

        const ext = file.name.substring(file.name.lastIndexOf('.'));
        await ff.writeFile('input' + ext, await fetchFile(file));

        // Loudnorm filter for normalization
        await ff.exec([
          '-i', 'input' + ext,
          '-af', `loudnorm=I=${targetDb}:LRA=11:TP=-1.5`,
          '-ar', '44100',
          'output' + ext,
        ]);

        const data = await ff.readFile('output' + ext);
        const blob = new Blob([data as unknown as BlobPart], { type: file.type });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace(/\.[^.]+$/, '_normalized' + ext);
        a.click();
        URL.revokeObjectURL(url);

        await ff.deleteFile('input' + ext);
        await ff.deleteFile('output' + ext);
      }
      setProgress(100);
    } catch (error) {
      console.error('Normalize error:', error);
      alert(t('common.error'));
    }
    setIsProcessing(false);
    setCurrentFile('');
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <label className={`dropzone flex flex-col items-center justify-center min-h-[150px] ${isDragging ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}>
          <input type="file" className="hidden" multiple accept="audio/*"
            onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          <Upload className="w-10 h-10 text-gray-400 mb-3" />
          <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
          <p className="text-sm text-gray-500">MP3, WAV, OGG, FLAC</p>
        </label>
      </div>

      {files.length > 0 && (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4" />
                {t('audioNormalize.targetLevel')}
              </label>
              <span className="text-sm font-bold text-primary-600">{targetDb} LUFS</span>
            </div>
            <div className="relative h-8 flex items-center">
              <div className="absolute inset-x-0 h-2 bg-gray-200 rounded-full" />
              <div
                className="absolute h-2 bg-primary-500 rounded-full transition-all"
                style={{ width: `${((targetDb + 24) / 15) * 100}%` }}
              />
              <input
                type="range"
                min="-24"
                max="-9"
                value={targetDb}
                onChange={(e) => setTargetDb(parseInt(e.target.value))}
                className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-3 h-6 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                style={{ left: `calc(${((targetDb + 24) / 15) * 100}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>-24 ({t('audioNormalize.quiet')})</span>
              <span>-14 ({t('audioNormalize.standard')})</span>
              <span>-9 ({t('audioNormalize.loud')})</span>
            </div>
          </div>

          <div className="space-y-2">
            {files.map((item, i) => (
              <div key={i} className="card p-3 flex items-center gap-3">
                <Volume2 className="w-8 h-8 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.file.name}</p>
                  <p className="text-xs text-gray-500">{formatSize(item.file.size)}</p>
                </div>
                <audio src={item.url} className="w-32 h-8" controls />
                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {isProcessing && (
            <div className="card">
              <p className="text-sm text-gray-600 mb-2">{currentFile}</p>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <button onClick={handleNormalize} disabled={isProcessing} className="btn btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isProcessing ? t('audioNormalize.normalizing') : `${t('audioNormalize.normalize')} (${files.length})`}
          </button>
        </>
      )}
    </div>
  );
}
