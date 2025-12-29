import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

const presets = [
  { label: '1080p', width: 1920, height: 1080 },
  { label: '720p', width: 1280, height: 720 },
  { label: '480p', width: 854, height: 480 },
  { label: '360p', width: 640, height: 360 },
];

export function VideoResize() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadVideo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && /^video\//i.test(file.type)) {
        loadVideo(file);
      }
    },
    [loadVideo]
  );

  const handleResize = async () => {
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

      await ff.exec([
        '-i', inputName,
        '-vf', `scale=${width}:${height}`,
        '-c:a', 'copy',
        'output.mp4',
      ]);

      const data = await ff.readFile('output.mp4');
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = video.name.replace(/\.[^.]+$/, `_${width}x${height}.mp4`);
      a.click();
      URL.revokeObjectURL(url);

      await ff.deleteFile(inputName);
      await ff.deleteFile('output.mp4');
    } catch (error) {
      console.error('Resize error:', error);
      alert(t('common.error'));
    }

    setIsProcessing(false);
  };

  return (
    <div className="space-y-6">
      {!video ? (
        <div className="card">
          <label
            className={`dropzone flex flex-col items-center justify-center min-h-[200px] ${isDragging ? 'active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
          >
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
              <span className="text-sm text-gray-600">{video.name}</span>
              <button onClick={() => { if (videoUrl) URL.revokeObjectURL(videoUrl); setVideo(null); setVideoUrl(null); }}
                className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <video src={videoUrl!} className="w-full max-h-[200px] bg-black rounded-lg" controls />
          </div>

          <div className="card">
            <div className="flex flex-wrap gap-2 mb-4">
              {presets.map((p) => (
                <button key={p.label} onClick={() => { setWidth(p.width); setHeight(p.height); }}
                  className={`px-3 py-1 text-sm rounded ${width === p.width ? 'bg-primary-500 text-white' : 'bg-gray-100'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.width')}</label>
                <input type="number" value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 640)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg" min={1} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.height')}</label>
                <input type="number" value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 360)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg" min={1} />
              </div>
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

          <button onClick={handleResize} disabled={isProcessing} className="btn btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isProcessing ? t('videoResize.resizing') : t('videoResize.resize')}
          </button>
        </>
      )}
    </div>
  );
}
