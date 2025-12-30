import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Play, Pause, RotateCcw, Square, RectangleHorizontal, Smartphone, Monitor } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const aspectRatios = [
  { label: 'crop.free', value: null, icon: Square },
  { label: '16:9', value: 16 / 9, icon: RectangleHorizontal },
  { label: '9:16', value: 9 / 16, icon: Smartphone },
  { label: '4:3', value: 4 / 3, icon: Monitor },
  { label: '1:1', value: 1, icon: Square },
  { label: '4:5', value: 4 / 5, icon: Smartphone },
];

export function VideoCrop() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 100, height: 100 });
  const [isDraggingCrop, setIsDraggingCrop] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [displayedVideoBounds, setDisplayedVideoBounds] = useState({ width: 0, height: 0, left: 0, top: 0 });

  // Calculate the actual displayed video bounds within the container
  const updateDisplayedVideoBounds = useCallback(() => {
    if (!videoRef.current || !containerRef.current) return;

    const video = videoRef.current;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();

    setDisplayedVideoBounds({
      width: videoRect.width,
      height: videoRect.height,
      left: videoRect.left - containerRect.left,
      top: videoRect.top - containerRect.top,
    });
  }, []);

  const loadVideo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setVideoInfo(null);
    setCropArea({ x: 0, y: 0, width: 100, height: 100 });
    setSelectedRatio(null);
  }, []);

  const handleVideoLoaded = () => {
    if (videoRef.current) {
      const info: VideoInfo = {
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        duration: videoRef.current.duration,
      };
      setVideoInfo(info);
      // Update bounds after video dimensions are known
      setTimeout(updateDisplayedVideoBounds, 50);
    }
  };

  // Update bounds on window resize
  useEffect(() => {
    window.addEventListener('resize', updateDisplayedVideoBounds);
    return () => window.removeEventListener('resize', updateDisplayedVideoBounds);
  }, [updateDisplayedVideoBounds]);

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

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const applyAspectRatio = (ratio: number | null) => {
    setSelectedRatio(ratio);
    if (!ratio || !videoInfo) {
      setCropArea({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }

    const videoRatio = videoInfo.width / videoInfo.height;

    if (ratio > videoRatio) {
      // Wider than video - fit to width
      const cropHeight = (videoRatio / ratio) * 100;
      setCropArea({
        x: 0,
        y: (100 - cropHeight) / 2,
        width: 100,
        height: cropHeight,
      });
    } else {
      // Taller than video - fit to height
      const cropWidth = (ratio / videoRatio) * 100;
      setCropArea({
        x: (100 - cropWidth) / 2,
        y: 0,
        width: cropWidth,
        height: 100,
      });
    }
  };

  const getEventCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('clientX' in e) {
      return { x: e.clientX, y: e.clientY };
    }
    return { x: 0, y: 0 };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const coords = getEventCoords(e);
    setIsDraggingCrop(handle);
    setDragStart({
      x: coords.x,
      y: coords.y,
      cropX: cropArea.x,
      cropY: cropArea.y,
      cropW: cropArea.width,
      cropH: cropArea.height,
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDraggingCrop || !videoInfo || displayedVideoBounds.width === 0) return;

      e.preventDefault();
      const coords = 'touches' in e && e.touches.length > 0
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };

      // Use displayed video bounds for accurate delta calculation
      const deltaX = ((coords.x - dragStart.x) / displayedVideoBounds.width) * 100;
      const deltaY = ((coords.y - dragStart.y) / displayedVideoBounds.height) * 100;

      const minSize = 10;
      let { x, y, width, height } = {
        x: dragStart.cropX,
        y: dragStart.cropY,
        width: dragStart.cropW,
        height: dragStart.cropH
      };

      if (isDraggingCrop === 'move') {
        x = Math.max(0, Math.min(100 - width, x + deltaX));
        y = Math.max(0, Math.min(100 - height, y + deltaY));
      } else {
        // West edge (left side)
        if (isDraggingCrop.includes('w')) {
          const newX = x + deltaX;
          const newWidth = width - deltaX;
          if (newX >= 0 && newWidth >= minSize) {
            x = newX;
            width = newWidth;
          } else if (newX < 0) {
            width = width + x;
            x = 0;
          } else if (newWidth < minSize) {
            x = x + width - minSize;
            width = minSize;
          }
        }

        // East edge (right side)
        if (isDraggingCrop.includes('e')) {
          const newWidth = width + deltaX;
          width = Math.max(minSize, Math.min(100 - x, newWidth));
        }

        // North edge (top)
        if (isDraggingCrop.includes('n')) {
          const newY = y + deltaY;
          const newHeight = height - deltaY;
          if (newY >= 0 && newHeight >= minSize) {
            y = newY;
            height = newHeight;
          } else if (newY < 0) {
            height = height + y;
            y = 0;
          } else if (newHeight < minSize) {
            y = y + height - minSize;
            height = minSize;
          }
        }

        // South edge (bottom)
        if (isDraggingCrop.includes('s')) {
          const newHeight = height + deltaY;
          height = Math.max(minSize, Math.min(100 - y, newHeight));
        }

        // Final bounds clamping
        x = Math.max(0, Math.min(100 - minSize, x));
        y = Math.max(0, Math.min(100 - minSize, y));
        width = Math.max(minSize, Math.min(100 - x, width));
        height = Math.max(minSize, Math.min(100 - y, height));

        // Apply aspect ratio constraint if set
        if (selectedRatio) {
          const currentWidth = (width / 100) * videoInfo.width;
          const currentHeight = (height / 100) * videoInfo.height;
          const currentCropRatio = currentWidth / currentHeight;

          if (currentCropRatio > selectedRatio) {
            width = (height / 100 * videoInfo.height * selectedRatio / videoInfo.width) * 100;
          } else {
            height = (width / 100 * videoInfo.width / selectedRatio / videoInfo.height) * 100;
          }
          // Re-clamp after aspect ratio
          width = Math.min(100 - x, width);
          height = Math.min(100 - y, height);
        }
      }

      setCropArea({ x, y, width, height });
    },
    [isDraggingCrop, dragStart, selectedRatio, videoInfo, displayedVideoBounds]
  );

  const handleMouseUp = useCallback(() => {
    setIsDraggingCrop(null);
  }, []);

  useEffect(() => {
    if (isDraggingCrop) {
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
  }, [isDraggingCrop, handleMouseMove, handleMouseUp]);

  const resetCrop = () => {
    setCropArea({ x: 0, y: 0, width: 100, height: 100 });
    setSelectedRatio(null);
  };

  const handleCrop = async () => {
    if (!video || !videoInfo) return;

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

      // Calculate actual crop dimensions
      const cropX = Math.round((cropArea.x / 100) * videoInfo.width);
      const cropY = Math.round((cropArea.y / 100) * videoInfo.height);
      let cropW = Math.round((cropArea.width / 100) * videoInfo.width);
      let cropH = Math.round((cropArea.height / 100) * videoInfo.height);

      // Ensure even dimensions
      cropW = cropW % 2 === 0 ? cropW : cropW - 1;
      cropH = cropH % 2 === 0 ? cropH : cropH - 1;

      await ff.exec([
        '-i', inputName,
        '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        'output.mp4',
      ]);

      const data = await ff.readFile('output.mp4');
      const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = video.name.replace(/\.[^.]+$/, `_cropped.mp4`);
      a.click();
      URL.revokeObjectURL(url);

      await ff.deleteFile(inputName);
      await ff.deleteFile('output.mp4');
    } catch (error) {
      console.error('Crop error:', error);
      alert(t('common.error'));
    }

    setIsProcessing(false);
  };

  const getCropDimensions = () => {
    if (!videoInfo) return null;
    const w = Math.round((cropArea.width / 100) * videoInfo.width);
    const h = Math.round((cropArea.height / 100) * videoInfo.height);
    return { width: w, height: h };
  };

  const cropDims = getCropDimensions();
  // For reset button and crop button: check if there's actual cropping (not 100%)
  const hasCropToDo = cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0;

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
            <input
              type="file"
              className="hidden"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadVideo(f);
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
            <p className="text-sm text-gray-500">MP4, WebM, MOV</p>
          </label>
        </div>
      ) : (
        <>
          {/* Video with crop overlay */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{video.name}</p>
                {videoInfo && (
                  <p className="text-xs text-gray-500">
                    {t('resize.original')}: {videoInfo.width} × {videoInfo.height}px
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  if (videoUrl) URL.revokeObjectURL(videoUrl);
                  setVideo(null);
                  setVideoUrl(null);
                  setVideoInfo(null);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video container with crop overlay */}
            <div
              ref={containerRef}
              className="relative bg-black rounded-lg overflow-hidden select-none"
              style={{ cursor: isDraggingCrop ? 'grabbing' : 'default' }}
            >
              <video
                ref={videoRef}
                src={videoUrl!}
                className="max-w-full max-h-[400px] mx-auto block"
                onLoadedMetadata={handleVideoLoaded}
                onEnded={() => setIsPlaying(false)}
                onLoadedData={updateDisplayedVideoBounds}
                loop
                muted
              />

              {/* Crop overlay - positioned over the video only */}
              {videoInfo && displayedVideoBounds.width > 0 && (
                <>
                  {/* Dark overlay for non-crop areas */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: displayedVideoBounds.left,
                      top: displayedVideoBounds.top,
                      width: displayedVideoBounds.width,
                      height: displayedVideoBounds.height,
                    }}
                  >
                    {/* Top */}
                    <div
                      className="absolute left-0 right-0 top-0 bg-black/60"
                      style={{ height: `${cropArea.y}%` }}
                    />
                    {/* Bottom */}
                    <div
                      className="absolute left-0 right-0 bottom-0 bg-black/60"
                      style={{ height: `${100 - cropArea.y - cropArea.height}%` }}
                    />
                    {/* Left */}
                    <div
                      className="absolute left-0 bg-black/60"
                      style={{
                        top: `${cropArea.y}%`,
                        height: `${cropArea.height}%`,
                        width: `${cropArea.x}%`,
                      }}
                    />
                    {/* Right */}
                    <div
                      className="absolute right-0 bg-black/60"
                      style={{
                        top: `${cropArea.y}%`,
                        height: `${cropArea.height}%`,
                        width: `${100 - cropArea.x - cropArea.width}%`,
                      }}
                    />
                  </div>

                  {/* Crop selection box - positioned over video */}
                  <div
                    className="absolute border-2 border-white cursor-move touch-none"
                    style={{
                      left: displayedVideoBounds.left + (cropArea.x / 100) * displayedVideoBounds.width,
                      top: displayedVideoBounds.top + (cropArea.y / 100) * displayedVideoBounds.height,
                      width: (cropArea.width / 100) * displayedVideoBounds.width,
                      height: (cropArea.height / 100) * displayedVideoBounds.height,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                    onTouchStart={(e) => handleMouseDown(e, 'move')}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
                      <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
                      <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
                      <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
                    </div>

                    {/* Resize handles - corners */}
                    <div
                      className="absolute w-5 h-5 bg-white border border-gray-400 rounded-sm cursor-nw-resize touch-none"
                      style={{ left: -10, top: -10 }}
                      onMouseDown={(e) => handleMouseDown(e, 'nw')}
                      onTouchStart={(e) => handleMouseDown(e, 'nw')}
                    />
                    <div
                      className="absolute w-5 h-5 bg-white border border-gray-400 rounded-sm cursor-ne-resize touch-none"
                      style={{ right: -10, top: -10 }}
                      onMouseDown={(e) => handleMouseDown(e, 'ne')}
                      onTouchStart={(e) => handleMouseDown(e, 'ne')}
                    />
                    <div
                      className="absolute w-5 h-5 bg-white border border-gray-400 rounded-sm cursor-sw-resize touch-none"
                      style={{ left: -10, bottom: -10 }}
                      onMouseDown={(e) => handleMouseDown(e, 'sw')}
                      onTouchStart={(e) => handleMouseDown(e, 'sw')}
                    />
                    <div
                      className="absolute w-5 h-5 bg-white border border-gray-400 rounded-sm cursor-se-resize touch-none"
                      style={{ right: -10, bottom: -10 }}
                      onMouseDown={(e) => handleMouseDown(e, 'se')}
                      onTouchStart={(e) => handleMouseDown(e, 'se')}
                    />
                    {/* Resize handles - edges */}
                    <div
                      className="absolute w-8 h-5 bg-white border border-gray-400 rounded-sm cursor-n-resize touch-none"
                      style={{ left: '50%', top: -10, transform: 'translateX(-50%)' }}
                      onMouseDown={(e) => handleMouseDown(e, 'n')}
                      onTouchStart={(e) => handleMouseDown(e, 'n')}
                    />
                    <div
                      className="absolute w-8 h-5 bg-white border border-gray-400 rounded-sm cursor-s-resize touch-none"
                      style={{ left: '50%', bottom: -10, transform: 'translateX(-50%)' }}
                      onMouseDown={(e) => handleMouseDown(e, 's')}
                      onTouchStart={(e) => handleMouseDown(e, 's')}
                    />
                    <div
                      className="absolute w-5 h-8 bg-white border border-gray-400 rounded-sm cursor-w-resize touch-none"
                      style={{ left: -10, top: '50%', transform: 'translateY(-50%)' }}
                      onMouseDown={(e) => handleMouseDown(e, 'w')}
                      onTouchStart={(e) => handleMouseDown(e, 'w')}
                    />
                    <div
                      className="absolute w-5 h-8 bg-white border border-gray-400 rounded-sm cursor-e-resize touch-none"
                      style={{ right: -10, top: '50%', transform: 'translateY(-50%)' }}
                      onMouseDown={(e) => handleMouseDown(e, 'e')}
                      onTouchStart={(e) => handleMouseDown(e, 'e')}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Play/Pause button */}
            <div className="flex justify-center mt-4">
              <button
                onClick={togglePlay}
                className="p-3 rounded-full bg-primary-500 text-white hover:bg-primary-600"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>
            </div>
          </div>

          {/* Aspect ratio presets */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">{t('crop.aspectRatio')}</label>
              {hasCropToDo && (
                <button
                  onClick={resetCrop}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('common.reset')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map((ratio) => {
                const Icon = ratio.icon;
                const isSelected = selectedRatio === ratio.value;
                return (
                  <button
                    key={ratio.label}
                    onClick={() => applyAspectRatio(ratio.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-primary-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {ratio.label.startsWith('crop.') ? t(ratio.label) : ratio.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Crop info */}
          {cropDims && videoInfo && (
            <div className="card">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {t('crop.result')}: {cropDims.width} × {cropDims.height}px
                </span>
                <span className="text-gray-500">
                  {Math.round((cropDims.width * cropDims.height) / (videoInfo.width * videoInfo.height) * 100)}% {t('crop.ofOriginal')}
                </span>
              </div>
            </div>
          )}

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
          <button
            onClick={handleCrop}
            disabled={isProcessing || !hasCropToDo}
            className="btn btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isProcessing ? t('videoCrop.cropping') : t('videoCrop.crop')}
          </button>
        </>
      )}
    </div>
  );
}
