import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Merge, ArrowUp, ArrowDown, Play } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';
import { consumePendingFiles } from '../../stores/pendingFiles';

interface VideoItem {
  id: string;
  file: File;
  url: string;
  duration?: number;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export function VideoMerge() {
  const { t } = useLanguage();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const addVideoFiles = useCallback((files: File[]) => {
    const videoFiles = files.filter((f) => /^video\//i.test(f.type));
    setVideos((prev) => [
      ...prev,
      ...videoFiles.map((file) => ({
        id: generateId(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setOutputUrl(null);
  }, []);

  useEffect(() => {
    const pending = consumePendingFiles();
    if (pending.length > 0) addVideoFiles(pending);
  }, [addVideoFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addVideoFiles(Array.from(e.dataTransfer.files));
    },
    [addVideoFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addVideoFiles(Array.from(e.target.files));
      e.target.value = '';
    },
    [addVideoFiles]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement)?.click();
  }, []);

  const removeVideo = useCallback((id: string) => {
    setVideos((prev) => {
      const item = prev.find((v) => v.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((v) => v.id !== id);
    });
    setOutputUrl(null);
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setVideos((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setVideos((prev) => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  }, []);

  const handleMerge = async () => {
    if (videos.length < 2) return;
    setIsProcessing(true);
    setProgress(0);
    setOutputUrl(null);

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

      // Write all video files to FFmpeg FS
      const fileNames: string[] = [];
      for (let i = 0; i < videos.length; i++) {
        const ext = videos[i].file.name.split('.').pop() || 'mp4';
        const name = `input_${i}.${ext}`;
        await ff.writeFile(name, await fetchFile(videos[i].file));
        fileNames.push(name);
      }

      // Build concat list
      const concatList = fileNames.map((n) => `file '${n}'`).join('\n');
      const encoder = new TextEncoder();
      await ff.writeFile('list.txt', encoder.encode(concatList));

      // Run concat
      await ff.exec([
        '-f', 'concat', '-safe', '0',
        '-i', 'list.txt',
        '-c', 'copy',
        'output.mp4',
      ]);

      const data = await ff.readFile('output.mp4');
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      setOutputUrl(URL.createObjectURL(blob));

      // Cleanup
      for (const name of fileNames) await ff.deleteFile(name);
      await ff.deleteFile('list.txt');
      await ff.deleteFile('output.mp4');
    } catch (err) {
      console.error('Merge error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        onTouchEnd={handleTouchEnd}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="video/*"
          onChange={handleFileSelect}
        />
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="font-medium text-gray-700 dark:text-gray-300">{t('merge.addVideos')}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('merge.videoFormats')}</p>
      </div>

      {/* Video list */}
      {videos.length > 0 && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {t('merge.order')} ({videos.length} {t('merge.files')})
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('merge.orderHint')}</p>
          </div>

          {videos.map((video, index) => (
            <div
              key={video.id}
              className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl"
            >
              {/* Order number */}
              <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {index + 1}
              </span>

              {/* Thumbnail */}
              <video
                src={video.url}
                className="w-14 h-10 object-cover rounded-lg flex-shrink-0 bg-gray-200"
                muted
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{video.file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatSize(video.file.size)}</p>
              </div>

              {/* Reorder buttons */}
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t('merge.moveUp')}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === videos.length - 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t('merge.moveDown')}
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeVideo(video.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title={t('merge.remove')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {videos.length >= 2 && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleMerge}
            disabled={isProcessing}
            className="btn btn-primary flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('merge.merging')} {progress > 0 && `${progress}%`}
              </>
            ) : (
              <>
                <Merge className="w-4 h-4" />
                {t('merge.mergeVideos')}
              </>
            )}
          </button>

          {isProcessing && (
            <div className="flex-1 flex items-center gap-3 min-w-[200px]">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400 w-10">{progress}%</span>
            </div>
          )}
        </div>
      )}

      {videos.length === 1 && (
        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <span>⚠</span>
          {t('merge.needMoreVideos')}
        </p>
      )}

      {/* Result */}
      {outputUrl && (
        <div className="card border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Play className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-900 dark:text-green-300">{t('merge.done')}</p>
                <p className="text-sm text-green-700 dark:text-green-400">{t('merge.videoDoneDesc')}</p>
              </div>
            </div>
            <a
              href={outputUrl}
              download="merged_video.mp4"
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {t('merge.download')}
            </a>
          </div>
          <video
            src={outputUrl}
            controls
            className="mt-4 w-full rounded-xl max-h-64 bg-black"
          />
        </div>
      )}
    </div>
  );
}
