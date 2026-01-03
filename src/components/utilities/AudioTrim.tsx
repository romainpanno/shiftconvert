import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

export function AudioTrim() {
  const { t } = useLanguage();
  const [audio, setAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const loadAudio = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setAudio(file);
    setAudioUrl(url);
    setWaveform([]);
    generateWaveform(file);
  }, []);

  const generateWaveform = async (file: File) => {
    try {
      const audioContext = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const rawData = audioBuffer.getChannelData(0);
      const samples = 100;
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData: number[] = [];

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[i * blockSize + j]);
        }
        filteredData.push(sum / blockSize);
      }

      const maxVal = Math.max(...filteredData);
      const normalized = filteredData.map((v) => v / maxVal);
      setWaveform(normalized);

      audioContext.close();
    } catch (e) {
      console.error('Waveform generation failed:', e);
      setWaveform(Array(100).fill(0.5));
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && /^audio\//i.test(file.type)) {
        loadAudio(file);
      }
    },
    [loadAudio]
  );

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      setDuration(dur);
      setEndTime(dur);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.currentTime >= endTime) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleTrim = async () => {
    if (!audio) return;

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

      const ext = audio.name.substring(audio.name.lastIndexOf('.'));
      await ff.writeFile('input' + ext, await fetchFile(audio));

      await ff.exec([
        '-i', 'input' + ext,
        '-ss', startTime.toString(),
        '-t', (endTime - startTime).toString(),
        '-c', 'copy',
        'output' + ext,
      ]);

      const data = await ff.readFile('output' + ext);
      const blob = new Blob([data as unknown as BlobPart], { type: audio.type });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = audio.name.replace(/\.[^.]+$/, '_trimmed' + ext);
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Trim error:', error);
      alert(t('common.error'));
    }

    setIsProcessing(false);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        if (audioRef.current.currentTime < startTime || audioRef.current.currentTime >= endTime) {
          audioRef.current.currentTime = startTime;
        }
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || draggingHandle) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    seekTo(Math.max(0, Math.min(duration, time)));
  };

  const handleHandleMouseDown = (handle: 'start' | 'end') => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingHandle(handle);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!draggingHandle || !timelineRef.current) return;

      e.preventDefault();
      const clientX = 'touches' in e && e.touches.length > 0
        ? e.touches[0].clientX
        : (e as MouseEvent).clientX;

      const rect = timelineRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
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

  const resetSelection = () => {
    setStartTime(0);
    setEndTime(duration);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const hasSelection = startTime > 0 || endTime < duration;

  useEffect(() => {
    if (draggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [draggingHandle, handleMouseMove, handleMouseUp]);

  return (
    <div className="space-y-6">
      {!audio ? (
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
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadAudio(file);
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">
              {t('dropzone.dragHere')}
            </p>
            <p className="text-sm text-gray-500">MP3, WAV, OGG, FLAC</p>
          </label>
        </div>
      ) : (
        <>
          {/* Audio info */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">{audio.name}</span>
              <button
                onClick={() => {
                  if (audioUrl) URL.revokeObjectURL(audioUrl);
                  setAudio(null);
                  setAudioUrl(null);
                  setWaveform([]);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl!}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />

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
            <div className="text-center text-sm text-gray-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          {/* Timeline with waveform */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Timeline</span>
              <div className="flex items-center gap-3">
                {hasSelection && (
                  <button
                    onClick={resetSelection}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                    title={t('common.reset')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('common.reset')}
                  </button>
                )}
                <span className="text-sm text-gray-500">
                  {t('audioTrim.duration')}: {formatTime(endTime - startTime)}
                </span>
              </div>
            </div>

            <div className="text-xs text-gray-500 mb-3">
              {t('crop.dragInstructions')}
            </div>

            {/* Waveform timeline */}
            <div
              ref={timelineRef}
              className="relative h-24 bg-gray-900 rounded-lg overflow-hidden cursor-pointer select-none"
              onClick={handleTimelineClick}
            >
              {/* Waveform visualization */}
              <div className="absolute inset-0 flex items-center">
                {waveform.length > 0 ? (
                  waveform.map((val, i) => {
                    const percent = i / waveform.length;
                    const isInSelection =
                      percent >= startTime / duration && percent <= endTime / duration;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex items-center justify-center"
                        style={{ height: '100%' }}
                      >
                        <div
                          className={`w-full mx-px rounded-sm transition-colors ${
                            isInSelection ? 'bg-primary-500' : 'bg-gray-600'
                          }`}
                          style={{ height: `${Math.max(4, val * 80)}%` }}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-gray-500 text-sm">{t('common.loading')}</div>
                  </div>
                )}
              </div>

              {/* Inactive region overlay - before start */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/50 pointer-events-none"
                style={{ width: `${(startTime / duration) * 100}%` }}
              />

              {/* Inactive region overlay - after end */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/50 pointer-events-none"
                style={{ width: `${((duration - endTime) / duration) * 100}%` }}
              />

              {/* Selection border */}
              <div
                className="absolute top-0 bottom-0 border-t-2 border-b-2 border-green-500 pointer-events-none"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                  right: `${((duration - endTime) / duration) * 100}%`,
                }}
              />

              {/* Start handle */}
              <div
                className="absolute top-0 bottom-0 w-6 bg-green-500 cursor-ew-resize flex items-center justify-center z-10 hover:bg-green-400 transition-colors touch-none"
                style={{ left: `calc(${(startTime / duration) * 100}% - 12px)` }}
                onMouseDown={handleHandleMouseDown('start')}
                onTouchStart={handleHandleMouseDown('start')}
              >
                <div className="w-1 h-10 bg-white rounded-full" />
              </div>

              {/* End handle */}
              <div
                className="absolute top-0 bottom-0 w-6 bg-green-500 cursor-ew-resize flex items-center justify-center z-10 hover:bg-green-400 transition-colors touch-none"
                style={{ left: `calc(${(endTime / duration) * 100}% - 12px)` }}
                onMouseDown={handleHandleMouseDown('end')}
                onTouchStart={handleHandleMouseDown('end')}
              >
                <div className="w-1 h-10 bg-white rounded-full" />
              </div>

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('audioTrim.start')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={startTime.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setStartTime(Math.max(0, Math.min(val, endTime - 0.5)));
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg min-h-[44px]"
                    step="0.1"
                    min="0"
                    max={endTime - 0.5}
                  />
                  <button
                    onClick={() => setStartTime(currentTime)}
                    className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg min-h-[44px] whitespace-nowrap"
                    title="Utiliser la position actuelle"
                  >
                    Ici
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('audioTrim.end')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={endTime.toFixed(2)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setEndTime(Math.max(startTime + 0.5, Math.min(val, duration)));
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg min-h-[44px]"
                    step="0.1"
                    min={startTime + 0.5}
                    max={duration}
                  />
                  <button
                    onClick={() => setEndTime(currentTime)}
                    className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg min-h-[44px] whitespace-nowrap"
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
              {isProcessing ? t('audioTrim.trimming') : t('audioTrim.trim')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
