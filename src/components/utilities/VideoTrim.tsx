import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

export function VideoTrim() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const loadVideo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setThumbnails([]);
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

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setEndTime(dur);
      generateThumbnails();
    }
  };

  const generateThumbnails = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const thumbCount = 10;
    const thumbs: string[] = [];

    canvas.width = 120;
    canvas.height = 68;

    for (let i = 0; i < thumbCount; i++) {
      const time = (video.duration / thumbCount) * i;
      video.currentTime = time;

      await new Promise<void>((resolve) => {
        const handler = () => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbs.push(canvas.toDataURL('image/jpeg', 0.5));
          video.removeEventListener('seeked', handler);
          resolve();
        };
        video.addEventListener('seeked', handler);
      });
    }

    setThumbnails(thumbs);
    video.currentTime = 0;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.currentTime >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleTrim = async () => {
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

      ff.on('progress', ({ progress: p }) => {
        setProgress(Math.round(p * 100));
      });

      const inputName = 'input' + video.name.substring(video.name.lastIndexOf('.'));
      const outputName = 'output.mp4';

      await ff.writeFile(inputName, await fetchFile(video));

      const durationSec = endTime - startTime;
      await ff.exec([
        '-i', inputName,
        '-ss', startTime.toString(),
        '-t', durationSec.toString(),
        '-c', 'copy',
        outputName,
      ]);

      const data = await ff.readFile(outputName);
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = video.name.replace(/\.[^.]+$/, '_trimmed.mp4');
      a.click();
      URL.revokeObjectURL(url);

      await ff.deleteFile(inputName);
      await ff.deleteFile(outputName);
    } catch (error) {
      console.error('Trim error:', error);
      alert(t('common.error'));
    }

    setIsProcessing(false);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        if (videoRef.current.currentTime < startTime || videoRef.current.currentTime >= endTime) {
          videoRef.current.currentTime = startTime;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || draggingHandle) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    seekTo(Math.max(startTime, Math.min(endTime, time)));
  };

  const handleHandleMouseDown = (handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingHandle(handle);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingHandle || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = percent * duration;

      if (draggingHandle === 'start') {
        const newStart = Math.min(time, endTime - 0.5);
        setStartTime(Math.max(0, newStart));
        if (currentTime < newStart) seekTo(newStart);
      } else {
        const newEnd = Math.max(time, startTime + 0.5);
        setEndTime(Math.min(duration, newEnd));
        if (currentTime > newEnd) seekTo(newEnd);
      }
    },
    [draggingHandle, duration, startTime, endTime, currentTime]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingHandle(null);
  }, []);

  useEffect(() => {
    if (draggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp]);

  return (
    <div className="space-y-6">
      {!video ? (
        <div className="card">
          <label
            className={`dropzone flex flex-col items-center justify-center min-h-[200px] ${
              isDragging ? 'active' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadVideo(file);
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">
              {t('dropzone.dragHere')}
            </p>
            <p className="text-sm text-gray-500">MP4, WebM, MOV</p>
          </label>
        </div>
      ) : (
        <>
          {/* Video preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">{video.name}</span>
              <button
                onClick={() => {
                  if (videoUrl) URL.revokeObjectURL(videoUrl);
                  setVideo(null);
                  setVideoUrl(null);
                  setThumbnails([]);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                src={videoUrl!}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className="w-full max-h-[300px]"
              />
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <button
                onClick={() => seekTo(startTime)}
                className="p-2 rounded-lg hover:bg-gray-100"
                title="Aller au début"
              >
                <SkipBack className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlay}
                className="p-3 rounded-full bg-primary-500 text-white hover:bg-primary-600"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>
              <button
                onClick={() => seekTo(endTime)}
                className="p-2 rounded-lg hover:bg-gray-100"
                title="Aller à la fin"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Current time display */}
            <div className="text-center text-sm text-gray-600 mb-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Timeline</span>
              <span className="text-sm text-gray-500">
                {t('videoTrim.duration')}: {formatTime(endTime - startTime)}
              </span>
            </div>

            <div className="text-xs text-gray-500 mb-3">
              {t('crop.dragInstructions')}
            </div>

            {/* Timeline with thumbnails */}
            <div
              ref={timelineRef}
              className="relative h-20 bg-gray-900 rounded-lg overflow-hidden cursor-pointer select-none"
              onClick={handleTimelineClick}
            >
              {/* Thumbnails */}
              <div className="absolute inset-0 flex">
                {thumbnails.length > 0 ? (
                  thumbnails.map((thumb, i) => (
                    <div key={i} className="flex-1 h-full">
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))
                ) : (
                  <div className="flex-1 bg-gray-800 animate-pulse" />
                )}
              </div>

              {/* Inactive region overlay - before start */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/70"
                style={{ width: `${(startTime / duration) * 100}%` }}
              />

              {/* Inactive region overlay - after end */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/70"
                style={{ width: `${((duration - endTime) / duration) * 100}%` }}
              />

              {/* Selection border */}
              <div
                className="absolute top-0 bottom-0 border-t-2 border-b-2 border-green-500"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                  right: `${((duration - endTime) / duration) * 100}%`,
                }}
              />

              {/* Start handle */}
              <div
                className="absolute top-0 bottom-0 w-4 bg-green-500 cursor-ew-resize flex items-center justify-center z-10 hover:bg-green-400 transition-colors"
                style={{ left: `calc(${(startTime / duration) * 100}% - 8px)` }}
                onMouseDown={handleHandleMouseDown('start')}
              >
                <div className="w-1 h-8 bg-white rounded-full" />
              </div>

              {/* End handle */}
              <div
                className="absolute top-0 bottom-0 w-4 bg-green-500 cursor-ew-resize flex items-center justify-center z-10 hover:bg-green-400 transition-colors"
                style={{ left: `calc(${(endTime / duration) * 100}% - 8px)` }}
                onMouseDown={handleHandleMouseDown('end')}
              >
                <div className="w-1 h-8 bg-white rounded-full" />
              </div>

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-20"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
              </div>
            </div>

            {/* Time labels */}
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>{formatTime(0)}</span>
              <span className="text-green-600 font-medium">
                {formatTime(startTime)} - {formatTime(endTime)}
              </span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Fine-tune controls */}
          <div className="card">
            <h4 className="text-sm font-medium text-gray-700 mb-3">{t('resize.dimensions')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('videoTrim.start')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={startTime.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setStartTime(Math.max(0, Math.min(val, endTime - 0.5)));
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                    step="0.1"
                    min="0"
                    max={endTime - 0.5}
                  />
                  <button
                    onClick={() => setStartTime(currentTime)}
                    className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                    title="Utiliser la position actuelle"
                  >
                    Ici
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('videoTrim.end')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={endTime.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEndTime(Math.max(startTime + 0.5, Math.min(val, duration)));
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                    step="0.1"
                    min={startTime + 0.5}
                    max={duration}
                  />
                  <button
                    onClick={() => setEndTime(currentTime)}
                    className="px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg"
                    title="Utiliser la position actuelle"
                  >
                    Ici
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="card">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-center text-gray-600 mt-2">{progress}%</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleTrim}
              disabled={isProcessing}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isProcessing ? t('videoTrim.trimming') : t('videoTrim.trim')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
