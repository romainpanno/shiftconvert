import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Link, Unlink, Maximize2, Square, RectangleHorizontal, Move, Shrink, Expand, ArrowRight, RotateCcw } from 'lucide-react';
import { ColorPicker } from '../ui/ColorPicker';
import { ProgressTracker, STEPS_IMAGE, STEPS_IMAGE_FFMPEG } from '../ui/ProgressTracker';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

type FitMode = 'scale' | 'cover' | 'contain' | 'fill' | 'fit-width' | 'fit-height';

// Check if a GIF file is animated
async function isAnimatedGif(file: File): Promise<boolean> {
  if (!file.type.includes('gif')) return false;
  const buffer = await file.arrayBuffer();
  const view = new Uint8Array(buffer);
  let frameCount = 0;
  for (let i = 0; i < view.length - 3; i++) {
    if (view[i] === 0x21 && view[i + 1] === 0xF9) {
      frameCount++;
      if (frameCount > 1) return true;
    }
  }
  return false;
}

export function ImageResize() {
  const { t } = useLanguage();
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 });
  const [newSize, setNewSize] = useState({ width: 0, height: 0 });
  const [keepRatio, setKeepRatio] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scalePercent, setScalePercent] = useState(100);
  const [fitMode, setFitMode] = useState<FitMode>('scale');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadImage = useCallback(async (file: File) => {
    const animated = await isAnimatedGif(file);
    setIsAnimated(animated);
    setOriginalFile(file);
    setImageLoaded(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setOriginalSize({ width: img.width, height: img.height });
        setNewSize({ width: img.width, height: img.height });
        setScalePercent(100);
      };
      img.src = e.target?.result as string;
      setImage(e.target?.result as string);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && /^image\//i.test(file.type)) {
        loadImage(file);
      }
    },
    [loadImage]
  );

  const updateWidth = (width: number) => {
    const newWidth = Math.max(1, width);
    const newHeight = keepRatio
      ? Math.round(newWidth * (originalSize.height / originalSize.width))
      : newSize.height;
    setNewSize({ width: newWidth, height: newHeight });
    setScalePercent(Math.round((newWidth / originalSize.width) * 100));
  };

  const updateHeight = (height: number) => {
    const newHeight = Math.max(1, height);
    const newWidth = keepRatio
      ? Math.round(newHeight * (originalSize.width / originalSize.height))
      : newSize.width;
    setNewSize({ width: newWidth, height: newHeight });
    setScalePercent(Math.round((newHeight / originalSize.height) * 100));
  };

  const updateScale = (percent: number) => {
    const scale = percent / 100;
    setScalePercent(percent);
    setNewSize({
      width: Math.round(originalSize.width * scale),
      height: Math.round(originalSize.height * scale),
    });
  };

  const applyPresetSize = (width: number, height: number) => {
    setNewSize({ width, height });
    setKeepRatio(false);
    setScalePercent(Math.round((width / originalSize.width) * 100));
  };

  const getOutputExt = () => {
    if (isAnimated) return 'gif';
    const originalExt = fileName.split('.').pop()?.toLowerCase() || 'png';
    if (originalExt === 'gif') return 'png';
    return originalExt;
  };

  const handleResize = async () => {
    if (!imageRef.current || !canvasRef.current || !originalFile) return;

    setIsProcessing(true);
    setError(null);
    setCurrentStep(0);
    setStepProgress(0);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const sw = img.naturalWidth, sh = img.naturalHeight;

    let finalWidth = newSize.width;
    let finalHeight = newSize.height;

    if (fitMode === 'fit-width') {
      const scale = newSize.width / sw;
      finalHeight = Math.round(sh * scale);
    } else if (fitMode === 'fit-height') {
      const scale = newSize.height / sh;
      finalWidth = Math.round(sw * scale);
    }

    // For animated GIFs, use FFmpeg
    if (isAnimated) {
      try {
        // Step 0: Init FFmpeg
        setCurrentStep(0);
        setStepProgress(0);

        if (!ffmpegRef.current) {
          ffmpegRef.current = new FFmpeg();
          ffmpegRef.current.on('progress', ({ progress: p }) => {
            setStepProgress(Math.round(p * 100));
          });
          await ffmpegRef.current.load({
            coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
            wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
          });
        }
        setStepProgress(100);

        // Step 1: Load file
        setCurrentStep(1);
        setStepProgress(0);
        const ff = ffmpegRef.current;
        await ff.writeFile('input.gif', await fetchFile(originalFile));
        setStepProgress(100);

        // Step 2: Process
        setCurrentStep(2);
        setStepProgress(0);

        // Build filter based on fit mode
        let scaleFilter: string;
        const hexToFFmpeg = (hex: string) => hex.replace('#', '0x');

        if (fitMode === 'contain') {
          scaleFilter = `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=decrease,pad=${finalWidth}:${finalHeight}:(ow-iw)/2:(oh-ih)/2:color=${hexToFFmpeg(bgColor)}`;
        } else if (fitMode === 'cover') {
          scaleFilter = `scale=${finalWidth}:${finalHeight}:force_original_aspect_ratio=increase,crop=${finalWidth}:${finalHeight}`;
        } else {
          scaleFilter = `scale=${finalWidth}:${finalHeight}:flags=lanczos`;
        }

        await ff.exec([
          '-i', 'input.gif',
          '-vf', `${scaleFilter},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          '-loop', '0',
          '-y', 'output.gif'
        ]);

        // Step 3: Encode/Download
        setCurrentStep(3);
        setStepProgress(0);

        const data = await ff.readFile('output.gif');
        const blob = new Blob([data as unknown as BlobPart], { type: 'image/gif' });
        const url = URL.createObjectURL(blob);
        setStepProgress(50);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.[^.]+$/, `_${finalWidth}x${finalHeight}.gif`);
        a.click();
        URL.revokeObjectURL(url);

        await ff.deleteFile('input.gif');
        await ff.deleteFile('output.gif');
        setStepProgress(100);
      } catch (err) {
        console.error('GIF resize error:', err);
        setError(t('common.error'));
      }
      setIsProcessing(false);
      return;
    }

    // For static images, use canvas with original format
    // Step 0: Load
    setCurrentStep(0);
    setStepProgress(50);

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    const mimeType = originalFile.type || 'image/png';
    const outputMime = mimeType === 'image/gif' ? 'image/png' : mimeType;
    setStepProgress(100);

    // Step 1: Process
    setCurrentStep(1);
    setStepProgress(0);

    // Fill background for contain mode or JPG
    if (fitMode === 'contain' || outputMime === 'image/jpeg') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let dx = 0, dy = 0, dw = finalWidth, dh = finalHeight;

    if (fitMode === 'cover') {
      const scale = Math.max(finalWidth / sw, finalHeight / sh);
      const scaledW = sw * scale;
      const scaledH = sh * scale;
      dx = (finalWidth - scaledW) / 2;
      dy = (finalHeight - scaledH) / 2;
      dw = scaledW;
      dh = scaledH;
    } else if (fitMode === 'contain') {
      const scale = Math.min(finalWidth / sw, finalHeight / sh);
      dw = sw * scale;
      dh = sh * scale;
      dx = (finalWidth - dw) / 2;
      dy = (finalHeight - dh) / 2;
    }

    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
    setStepProgress(100);

    // Step 2: Encode
    setCurrentStep(2);
    setStepProgress(0);

    const useQuality = outputMime === 'image/jpeg' || outputMime === 'image/webp';

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.[^.]+$/, `_${canvas.width}x${canvas.height}.${getOutputExt()}`);
        a.click();
        URL.revokeObjectURL(url);
      }
      setStepProgress(100);
      setIsProcessing(false);
    }, outputMime, useQuality ? 0.9 : undefined);
  };

  // Generate live preview
  useEffect(() => {
    if (!imageRef.current || !image || !imageLoaded) return;

    const img = imageRef.current;
    const sw = img.naturalWidth, sh = img.naturalHeight;

    // Skip if image dimensions not available yet
    if (sw === 0 || sh === 0) return;

    let canvasW = newSize.width;
    let canvasH = newSize.height;

    // Calculate actual output size for fit-width/fit-height modes
    if (fitMode === 'fit-width') {
      const scale = newSize.width / sw;
      canvasH = Math.round(sh * scale);
    } else if (fitMode === 'fit-height') {
      const scale = newSize.height / sh;
      canvasW = Math.round(sw * scale);
    }

    // For animated GIFs, skip canvas rendering - use CSS scaling instead
    if (isAnimated) {
      setPreviewUrl(image); // Use original animated GIF
      setPreviewSize({ width: canvasW, height: canvasH });
      return;
    }

    // For static images, use canvas preview
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Fill background
    if (fitMode === 'contain') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    let dx = 0, dy = 0, dw = canvasW, dh = canvasH;

    if (fitMode === 'cover') {
      const scale = Math.max(canvasW / sw, canvasH / sh);
      const scaledW = sw * scale;
      const scaledH = sh * scale;
      dx = (canvasW - scaledW) / 2;
      dy = (canvasH - scaledH) / 2;
      dw = scaledW;
      dh = scaledH;
    } else if (fitMode === 'contain') {
      const scale = Math.min(canvasW / sw, canvasH / sh);
      dw = sw * scale;
      dh = sh * scale;
      dx = (canvasW - dw) / 2;
      dy = (canvasH - dh) / 2;
    }

    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);

    // Update preview URL
    setPreviewUrl(canvas.toDataURL('image/png'));
    setPreviewSize({ width: canvasW, height: canvasH });
  }, [image, newSize.width, newSize.height, fitMode, bgColor, isAnimated, imageLoaded]);

  const fitModes: { id: FitMode; label: string; icon: React.ReactNode }[] = [
    { id: 'scale', label: t('resize.scale'), icon: <Expand className="w-4 h-4" /> },
    { id: 'cover', label: t('resize.cover'), icon: <Square className="w-4 h-4" /> },
    { id: 'contain', label: t('resize.contain'), icon: <Shrink className="w-4 h-4" /> },
    { id: 'fill', label: t('resize.fill'), icon: <Move className="w-4 h-4" /> },
    { id: 'fit-width', label: t('resize.fitWidth'), icon: <RectangleHorizontal className="w-4 h-4" /> },
    { id: 'fit-height', label: t('resize.fitHeight'), icon: <RectangleHorizontal className="w-4 h-4 rotate-90" /> },
  ];

  const commonSizes = [
    { label: 'Instagram Post', width: 1080, height: 1080, color: 'from-pink-500 to-purple-500' },
    { label: 'Instagram Story', width: 1080, height: 1920, color: 'from-purple-500 to-pink-500' },
    { label: 'Facebook', width: 1200, height: 630, color: 'from-blue-500 to-blue-600' },
    { label: 'Twitter/X', width: 1200, height: 675, color: 'from-gray-700 to-gray-900' },
    { label: 'YouTube', width: 1280, height: 720, color: 'from-red-500 to-red-600' },
    { label: 'LinkedIn', width: 1200, height: 627, color: 'from-blue-600 to-blue-700' },
    { label: 'HD 1080p', width: 1920, height: 1080, color: 'from-green-500 to-emerald-500' },
    { label: '4K UHD', width: 3840, height: 2160, color: 'from-amber-500 to-orange-500' },
  ];

  const getScaleLabel = () => {
    if (scalePercent < 50) return { text: t('resize.veryReduced'), color: 'text-red-600' };
    if (scalePercent < 100) return { text: t('resize.reduction'), color: 'text-orange-600' };
    if (scalePercent === 100) return { text: t('resize.originalSize'), color: 'text-gray-600' };
    if (scalePercent <= 200) return { text: t('resize.enlargement'), color: 'text-blue-600' };
    return { text: t('resize.veryEnlarged'), color: 'text-purple-600' };
  };

  const scaleInfo = getScaleLabel();

  const resetSettings = () => {
    setNewSize({ width: originalSize.width, height: originalSize.height });
    setScalePercent(100);
    setKeepRatio(true);
    setFitMode('scale');
    setBgColor('#ffffff');
  };

  // Calculate preview sizes - show actual proportions
  const maxPreviewWidth = 180;
  const maxPreviewHeight = 160;

  // Scale to fit within max bounds while preserving aspect ratio
  const getPreviewDimensions = (w: number, h: number) => {
    if (w === 0 || h === 0) {
      return { width: maxPreviewWidth, height: maxPreviewHeight };
    }
    const scaleW = maxPreviewWidth / w;
    const scaleH = maxPreviewHeight / h;
    const scale = Math.min(scaleW, scaleH, 1);
    return {
      width: Math.round(w * scale),
      height: Math.round(h * scale),
    };
  };

  const originalPreview = getPreviewDimensions(originalSize.width, originalSize.height);

  // Calculate target preview dimensions directly (not from state) for responsive updates
  const getTargetPreviewDimensions = () => {
    let targetW = newSize.width;
    let targetH = newSize.height;

    if (fitMode === 'fit-width' && originalSize.width > 0) {
      const scale = newSize.width / originalSize.width;
      targetH = Math.round(originalSize.height * scale);
    } else if (fitMode === 'fit-height' && originalSize.height > 0) {
      const scale = newSize.height / originalSize.height;
      targetW = Math.round(originalSize.width * scale);
    }

    return getPreviewDimensions(targetW, targetH);
  };

  const targetPreview = getTargetPreviewDimensions();

  return (
    <div className="space-y-6">
      {!image ? (
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
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) loadImage(file);
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">
              {t('dropzone.dragHere')}
            </p>
            <p className="text-sm text-gray-500">PNG, JPG, WebP, GIF</p>
          </label>
        </div>
      ) : (
        <>
          {/* Side by Side Comparison */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                {t('resize.preview')}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetSettings}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title={t('common.reset')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setImage(null);
                    setFileName('');
                  }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Visual comparison - real proportions */}
            <div className="flex items-end justify-center gap-8 py-6 px-4 bg-gray-50 rounded-xl min-h-[200px]">
              {/* Original */}
              <div className="flex flex-col items-center">
                <div
                  className="relative rounded-lg shadow-md overflow-hidden border-2 border-gray-300"
                  style={{
                    width: originalPreview.width,
                    height: originalPreview.height,
                    background: 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%) 50% / 12px 12px'
                  }}
                >
                  {isAnimated && (
                    <div className="absolute top-1 left-1 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                      GIF
                    </div>
                  )}
                  <img
                    src={image}
                    alt="Original"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-3 text-center">
                  <p className="text-xs text-gray-500">{t('resize.original')}</p>
                  <p className="text-sm font-bold text-gray-700">{originalSize.width} × {originalSize.height}</p>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center gap-2 pb-8">
                <ArrowRight className="w-6 h-6 text-gray-400" />
                <div className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  scalePercent > 100 ? 'bg-blue-100 text-blue-700' :
                  scalePercent < 100 ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {scalePercent}%
                </div>
              </div>

              {/* Live preview - actual render */}
              <div className="flex flex-col items-center">
                <div
                  className="relative rounded-lg shadow-md overflow-hidden border-2 border-primary-500 flex items-center justify-center"
                  style={{
                    ...targetPreview,
                    backgroundColor: fitMode === 'contain' ? bgColor : undefined,
                    background: fitMode !== 'contain' ? 'repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%) 50% / 12px 12px' : undefined,
                  }}
                >
                  {isAnimated && (
                    <div className="absolute top-1 left-1 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
                      GIF
                    </div>
                  )}
                  {previewUrl ? (
                    isAnimated ? (
                      // For animated GIFs, use CSS to simulate fit modes
                      <img
                        key={`${fitMode}-${previewSize.width}-${previewSize.height}`}
                        src={previewUrl}
                        alt={t('resize.preview')}
                        className="w-full h-full"
                        style={{
                          objectFit: fitMode === 'cover' ? 'cover' :
                                     fitMode === 'contain' ? 'contain' :
                                     'fill',
                        }}
                      />
                    ) : (
                      // For static images, canvas already rendered correctly - just display it
                      <img
                        key={`preview-${fitMode}-${previewSize.width}-${previewSize.height}`}
                        src={previewUrl}
                        alt={t('resize.preview')}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                        }}
                      />
                    )
                  ) : (
                    <div className="w-32 h-24 flex items-center justify-center text-gray-400 text-xs">
                      {t('common.loading')}
                    </div>
                  )}
                </div>
                <div className="mt-3 text-center">
                  <p className="text-xs text-primary-600">{t('resize.finalRender')}</p>
                  <p className="text-sm font-bold text-primary-700">
                    {fitMode === 'fit-width' && originalSize.width > 0
                      ? `${newSize.width} × ${Math.round(originalSize.height * (newSize.width / originalSize.width))}`
                      : fitMode === 'fit-height' && originalSize.height > 0
                      ? `${Math.round(originalSize.width * (newSize.height / originalSize.height))} × ${newSize.height}`
                      : `${newSize.width} × ${newSize.height}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Hidden image for processing */}
            <img
              ref={imageRef}
              src={image}
              alt=""
              className="hidden"
              onLoad={() => setImageLoaded(true)}
            />
          </div>

          {/* Fit Mode */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('resize.mode')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {fitModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setFitMode(mode.id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                    fitMode === mode.id
                      ? 'bg-primary-500 text-white shadow-lg scale-105'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  {mode.icon}
                  <span className="text-xs font-medium">{mode.label}</span>
                </button>
              ))}
            </div>

            {/* Background color for contain mode */}
            {fitMode === 'contain' && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                <ColorPicker
                  value={bgColor}
                  onChange={setBgColor}
                  label={t('resize.bgColor')}
                />
              </div>
            )}
          </div>

          {/* Scale slider - Simple native slider */}
          {fitMode === 'scale' && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-gray-700">{t('resize.scale')}</label>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${scaleInfo.color}`}>
                    {scaleInfo.text}
                  </span>
                  <input
                    type="number"
                    value={scalePercent}
                    onChange={(e) => updateScale(Math.max(10, Math.min(300, parseInt(e.target.value) || 100)))}
                    className="w-16 px-2 py-1 text-sm font-bold text-center border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary-500"
                    min={10}
                    max={300}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              {/* Custom slider with bar thumb */}
              <div className="relative h-8 flex items-center">
                <div className="absolute inset-x-0 h-2 bg-gray-200 rounded-full" />
                <div
                  className="absolute h-2 bg-primary-500 rounded-full transition-all"
                  style={{ width: `${((scalePercent - 10) / 290) * 100}%` }}
                />
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={scalePercent}
                  onChange={(e) => updateScale(parseInt(e.target.value))}
                  className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer z-10"
                />
                <div
                  className="absolute w-3 h-6 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                  style={{ left: `calc(${((scalePercent - 10) / 290) * 100}% - 6px)` }}
                />
              </div>

              {/* Labels */}
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>10%</span>
                <span className="text-gray-700 font-medium">100%</span>
                <span>300%</span>
              </div>

              {/* Quick presets */}
              <div className="grid grid-cols-6 gap-2 mt-4">
                {[25, 50, 75, 100, 150, 200].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => updateScale(percent)}
                    className={`py-2 rounded-lg text-sm font-medium transition-all ${
                      scalePercent === percent
                        ? 'bg-primary-500 text-white shadow-md'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dimensions */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-gray-700">{t('resize.dimensions')}</label>
              <button
                onClick={() => setKeepRatio(!keepRatio)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  keepRatio
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {keepRatio ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                {keepRatio ? t('resize.linked') : t('resize.unlinked')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.width')}</label>
                <input
                  type="number"
                  value={newSize.width}
                  onChange={(e) => updateWidth(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:border-primary-500 transition-colors"
                  min={1}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('resize.height')}</label>
                <input
                  type="number"
                  value={newSize.height}
                  onChange={(e) => updateHeight(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-center font-bold focus:outline-none focus:border-primary-500 transition-colors"
                  min={1}
                />
              </div>
            </div>
          </div>

          {/* Common sizes - Enhanced */}
          <div className="card">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('resize.presets')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {commonSizes.map((size) => (
                <button
                  key={size.label}
                  onClick={() => applyPresetSize(size.width, size.height)}
                  className={`group relative overflow-hidden rounded-lg transition-all hover:scale-[1.02] ${
                    newSize.width === size.width && newSize.height === size.height
                      ? 'ring-2 ring-primary-500 ring-offset-1'
                      : ''
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${size.color} opacity-90`} />
                  <div className="relative px-3 py-2.5 text-white">
                    <p className="font-medium text-sm">{size.label}</p>
                    <p className="text-xs opacity-80">{size.width}×{size.height}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="card bg-red-50 border-red-200">
              <div className="flex items-center gap-2 text-red-700">
                <X className="w-5 h-5" />
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Progress tracker */}
          <ProgressTracker
            steps={isAnimated ? STEPS_IMAGE_FFMPEG : STEPS_IMAGE}
            currentStepIndex={currentStep}
            progress={stepProgress}
            isProcessing={isProcessing}
            fileSizeMB={originalFile ? originalFile.size / (1024 * 1024) : undefined}
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleResize}
              disabled={isProcessing}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isProcessing ? t('common.processing') : t('common.download')}
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={previewCanvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}
