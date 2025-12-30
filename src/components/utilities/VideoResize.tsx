import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Link, Unlink, RotateCcw, Monitor, Smartphone, Tablet } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

const presets = [
  { label: '4K', width: 3840, height: 2160, icon: Monitor },
  { label: '1080p', width: 1920, height: 1080, icon: Monitor },
  { label: '720p', width: 1280, height: 720, icon: Monitor },
  { label: '480p', width: 854, height: 480, icon: Tablet },
  { label: '360p', width: 640, height: 360, icon: Smartphone },
  { label: '240p', width: 426, height: 240, icon: Smartphone },
];

export function VideoResize() {
  const { t } = useLanguage();
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [keepRatio, setKeepRatio] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string | null>('720p');
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadVideo = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setVideoInfo(null);
  }, []);

  const handleVideoLoaded = () => {
    if (videoRef.current) {
      const info: VideoInfo = {
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        duration: videoRef.current.duration,
      };
      setVideoInfo(info);

      // Find best matching preset or set custom
      const matchingPreset = presets.find(p =>
        (p.width === info.width && p.height === info.height) ||
        (p.width === info.height && p.height === info.width) // rotated
      );

      if (matchingPreset) {
        setSelectedPreset(matchingPreset.label);
        setWidth(info.width);
        setHeight(info.height);
      } else {
        // Default to 720p if video is larger, otherwise keep original
        if (info.width > 1280 || info.height > 720) {
          const ratio = info.width / info.height;
          if (ratio > 1) {
            setWidth(1280);
            setHeight(Math.round(1280 / ratio));
          } else {
            setHeight(720);
            setWidth(Math.round(720 * ratio));
          }
          setSelectedPreset('720p');
        } else {
          setWidth(info.width);
          setHeight(info.height);
          setSelectedPreset(null);
        }
      }
    }
  };

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

  const applyPreset = (preset: typeof presets[0]) => {
    if (!videoInfo) return;

    const originalRatio = videoInfo.width / videoInfo.height;
    const presetRatio = preset.width / preset.height;

    // Fit video to preset while keeping aspect ratio
    if (keepRatio) {
      if (originalRatio > presetRatio) {
        // Video is wider - fit to width
        setWidth(preset.width);
        setHeight(Math.round(preset.width / originalRatio));
      } else {
        // Video is taller - fit to height
        setHeight(preset.height);
        setWidth(Math.round(preset.height * originalRatio));
      }
    } else {
      setWidth(preset.width);
      setHeight(preset.height);
    }
    setSelectedPreset(preset.label);
  };

  const handleWidthChange = (newWidth: number) => {
    setWidth(newWidth);
    setSelectedPreset(null);
    if (keepRatio && videoInfo) {
      const ratio = videoInfo.width / videoInfo.height;
      setHeight(Math.round(newWidth / ratio));
    }
  };

  const handleHeightChange = (newHeight: number) => {
    setHeight(newHeight);
    setSelectedPreset(null);
    if (keepRatio && videoInfo) {
      const ratio = videoInfo.width / videoInfo.height;
      setWidth(Math.round(newHeight * ratio));
    }
  };

  const resetToOriginal = () => {
    if (videoInfo) {
      setWidth(videoInfo.width);
      setHeight(videoInfo.height);
      setSelectedPreset(null);
    }
  };

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

      // Ensure dimensions are even (required by most codecs)
      const finalWidth = width % 2 === 0 ? width : width + 1;
      const finalHeight = height % 2 === 0 ? height : height + 1;

      await ff.exec([
        '-i', inputName,
        '-vf', `scale=${finalWidth}:${finalHeight}`,
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
      a.download = video.name.replace(/\.[^.]+$/, `_${finalWidth}x${finalHeight}.mp4`);
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

  const getScaleInfo = () => {
    if (!videoInfo) return null;
    const originalPixels = videoInfo.width * videoInfo.height;
    const newPixels = width * height;
    const percent = Math.round((newPixels / originalPixels) * 100);

    if (percent > 100) return { text: t('resize.enlargement'), percent, color: 'text-blue-600' };
    if (percent === 100) return { text: t('resize.noChange'), percent, color: 'text-gray-500' };
    if (percent > 50) return { text: t('resize.reduction'), percent, color: 'text-green-600' };
    return { text: t('resize.strongReduction'), percent, color: 'text-orange-600' };
  };

  const scaleInfo = getScaleInfo();
  const hasChanges = videoInfo && (width !== videoInfo.width || height !== videoInfo.height);

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
          {/* Video preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{video.name}</p>
                {videoInfo && (
                  <p className="text-xs text-gray-500">
                    {t('resize.original')}: {videoInfo.width} × {videoInfo.height}px
                    {videoInfo.duration && ` • ${Math.round(videoInfo.duration)}s`}
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
            <video
              ref={videoRef}
              src={videoUrl!}
              className="w-full max-h-[200px] bg-black rounded-lg"
              controls
              onLoadedMetadata={handleVideoLoaded}
            />
          </div>

          {/* Presets */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">{t('videoResize.presets')}</label>
              {hasChanges && (
                <button
                  onClick={resetToOriginal}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  {t('common.reset')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => {
                const Icon = preset.icon;
                const isDisabled = videoInfo && (preset.width > videoInfo.width && preset.height > videoInfo.height);
                return (
                  <button
                    key={preset.label}
                    onClick={() => applyPreset(preset)}
                    disabled={!!isDisabled}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedPreset === preset.label
                        ? 'bg-primary-500 text-white shadow-md'
                        : isDisabled
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {preset.label}
                    <span className="text-xs opacity-70">{preset.width}×{preset.height}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom dimensions */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">{t('resize.dimensions')}</label>
              <button
                onClick={() => setKeepRatio(!keepRatio)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  keepRatio ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {keepRatio ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                {t('resize.keepRatio')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.width')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={width}
                    onChange={(e) => handleWidthChange(parseInt(e.target.value) || 640)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    min={1}
                  />
                  <span className="text-gray-400 text-sm">px</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.height')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => handleHeightChange(parseInt(e.target.value) || 360)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                    min={1}
                  />
                  <span className="text-gray-400 text-sm">px</span>
                </div>
              </div>
            </div>

            {/* Scale info */}
            {scaleInfo && videoInfo && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {videoInfo.width}×{videoInfo.height} → {width}×{height}
                  </span>
                  <span className={`font-medium ${scaleInfo.color}`}>
                    {scaleInfo.percent}% ({scaleInfo.text})
                  </span>
                </div>
              </div>
            )}
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
          <button
            onClick={handleResize}
            disabled={isProcessing || !hasChanges}
            className="btn btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {isProcessing ? t('videoResize.resizing') : t('videoResize.resize')}
          </button>
        </>
      )}
    </div>
  );
}
