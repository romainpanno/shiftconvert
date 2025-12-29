import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X, Music } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

export function VideoExtractAudio() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [format, setFormat] = useState<'mp3' | 'wav' | 'aac'>('mp3');
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

  const handleExtract = async () => {
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

      const outputName = `output.${format}`;
      const args = format === 'mp3'
        ? ['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputName]
        : format === 'wav'
        ? ['-i', inputName, '-vn', '-acodec', 'pcm_s16le', outputName]
        : ['-i', inputName, '-vn', '-acodec', 'aac', '-b:a', '192k', outputName];

      await ff.exec(args);

      const data = await ff.readFile(outputName);
      const mimeType = format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : 'audio/aac';
      const blob = new Blob([data as unknown as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = video.name.replace(/\.[^.]+$/, `.${format}`);
      a.click();
      URL.revokeObjectURL(url);

      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);
    } catch (error) {
      console.error('Extract error:', error);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

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
            <p className="text-sm text-gray-500">MP4, WebM, MOV, AVI</p>
          </label>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8 text-primary-500" />
                <p className="text-sm font-medium text-gray-900">{video.name}</p>
              </div>
              <button onClick={() => { if (videoUrl) URL.revokeObjectURL(videoUrl); setVideo(null); setVideoUrl(null); }}
                className="text-gray-400 hover:text-red-500"><X className="w-5 h-5" /></button>
            </div>
            <video src={videoUrl!} className="w-full max-h-[200px] bg-black rounded-lg" controls />
          </div>

          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('videoExtract.format')}</label>
            <div className="flex gap-2">
              {(['mp3', 'wav', 'aac'] as const).map((f) => (
                <button key={f} onClick={() => setFormat(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${format === f ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {f.toUpperCase()}
                </button>
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

          <button onClick={handleExtract} disabled={isProcessing} className="btn btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            {isProcessing ? t('videoExtract.extracting') : `${t('videoExtract.extract')} ${format.toUpperCase()}`}
          </button>
        </>
      )}
    </div>
  );
}
