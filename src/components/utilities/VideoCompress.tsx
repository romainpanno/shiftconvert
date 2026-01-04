import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

export function VideoCompress() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState(23);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadVideo = useCallback((file: File) => {
    setVideo(file);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /^video\//i.test(file.type)) loadVideo(file);
  }, [loadVideo]);

  const handleCompress = async () => {
    if (!video) return;
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
      ff.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)));

      const inputName = 'input' + video.name.substring(video.name.lastIndexOf('.'));
      await ff.writeFile(inputName, await fetchFile(video));

      await ff.exec(['-i', inputName, '-c:v', 'libx264', '-crf', quality.toString(), '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-y', 'output.mp4']);

      const data = await ff.readFile('output.mp4');
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = video.name.replace(/\.[^.]+$/, '_compressed.mp4');
      a.click();
      URL.revokeObjectURL(url);

      await ff.deleteFile(inputName);
      await ff.deleteFile('output.mp4');
    } catch (error) {
      console.error('Compress error:', error);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  const getQualityLabel = () => {
    if (quality < 20) return { text: t('videoCompress.highQuality'), color: 'text-green-600' };
    if (quality < 28) return { text: t('videoCompress.balanced'), color: 'text-yellow-600' };
    return { text: t('compress.strongCompression'), color: 'text-red-600' };
  };

  const qualityInfo = getQualityLabel();

  return (
    <div className="space-y-6">
      {!video ? (
        <div className="card">
          <label className={`dropzone flex flex-col items-center justify-center min-h-[200px] ${isDragging ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}>
            <input type="file" className="hidden" accept="video/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadVideo(f); e.target.value = ''; }} />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
            <p className="text-sm text-gray-500">MP4, WebM, MOV</p>
          </label>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{video.name}</p>
                <p className="text-xs text-gray-500">{t('common.size')}: {formatSize(video.size)}</p>
              </div>
              <button onClick={() => { if (videoUrl) URL.revokeObjectURL(videoUrl); setVideo(null); setVideoUrl(null); }}
                className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <video src={videoUrl!} className="w-full max-h-[200px] bg-black rounded-lg" controls />
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">{t('common.quality')}</label>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${qualityInfo.color}`}>
                  {qualityInfo.text}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">CRF: {quality}</span>
              </div>
            </div>
            <div className="relative h-8 flex items-center">
              <div className="absolute inset-x-0 h-2 bg-gray-200 rounded-full" />
              <div
                className="absolute h-2 bg-primary-500 rounded-full transition-all"
                style={{ width: `${((quality - 18) / 17) * 100}%` }}
              />
              <input
                type="range"
                min="18"
                max="35"
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value))}
                className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-3 h-6 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                style={{ left: `calc(${((quality - 18) / 17) * 100}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{t('videoCompress.highQuality')}</span>
              <span>{t('compress.strongCompression')}</span>
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

          <button onClick={handleCompress} disabled={isProcessing} className="btn btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isProcessing ? t('videoCompress.compressing') : t('videoCompress.compress')}
          </button>
        </>
      )}
    </div>
  );
}
