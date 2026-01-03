import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X, RotateCw, RotateCcw, FlipHorizontal, FlipVertical, RefreshCcw } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useLanguage } from '../../i18n';

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

export function ImageRotate() {
  const { t } = useLanguage();
  const [image, setImage] = useState<string | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadImage = useCallback(async (file: File) => {
    const animated = await isAnimatedGif(file);
    setIsAnimated(animated);
    setOriginalFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setFileName(file.name);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
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

  const getOutputExt = () => {
    if (isAnimated) return 'gif';
    const originalExt = originalFile?.name.split('.').pop()?.toLowerCase() || 'jpg';
    if (originalExt === 'gif') return 'png'; // Static GIF -> PNG (canvas can't write GIF)
    return originalExt;
  };

  const handleDownload = async () => {
    if (!imageRef.current || !canvasRef.current || !originalFile) return;

    setIsProcessing(true);

    try {
      // For animated GIFs, use FFmpeg to preserve animation
      if (isAnimated) {
        if (!ffmpegRef.current) {
          ffmpegRef.current = new FFmpeg();
          await ffmpegRef.current.load({
            coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
            wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
          });
        }

        const ff = ffmpegRef.current;
        await ff.writeFile('input.gif', await fetchFile(originalFile));

        // Build FFmpeg filter for rotation and flips
        const filters: string[] = [];

        // Handle rotation
        if (rotation === 90) filters.push('transpose=1');
        else if (rotation === 180) filters.push('transpose=1,transpose=1');
        else if (rotation === 270) filters.push('transpose=2');

        // Handle flips
        if (flipH) filters.push('hflip');
        if (flipV) filters.push('vflip');

        // Apply transforms with palette for GIF quality
        const transformFilter = filters.length > 0 ? filters.join(',') + ',' : '';
        const vfFilter = `${transformFilter}split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;

        await ff.exec([
          '-i', 'input.gif',
          '-vf', vfFilter,
          '-loop', '0',
          '-y', 'output.gif'
        ]);

        const data = await ff.readFile('output.gif');
        const blob = new Blob([data as unknown as BlobPart], { type: 'image/gif' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.[^.]+$/, `_rotated.gif`);
        a.click();
        URL.revokeObjectURL(url);

        await ff.deleteFile('input.gif');
        await ff.deleteFile('output.gif');
        setIsProcessing(false);
        return;
      }

      // For static images, use canvas with format preservation
      const img = imageRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      const isRotated90 = rotation === 90 || rotation === 270;
      canvas.width = isRotated90 ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRotated90 ? img.naturalWidth : img.naturalHeight;

      // Get original format
      const originalExt = originalFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = originalFile.type || 'image/jpeg';
      const outputMime = mimeType === 'image/gif' ? 'image/png' : mimeType;

      // For JPEG, fill with white background
      if (outputMime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      const useQuality = outputMime === 'image/jpeg' || outputMime === 'image/webp';
      const outputExt = getOutputExt();

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName.replace(/\.[^.]+$/, `_rotated.${outputExt}`);
          a.click();
          URL.revokeObjectURL(url);
        }
        setIsProcessing(false);
      }, outputMime, useQuality ? 0.92 : undefined);
    } catch (error) {
      console.error('Rotation error:', error);
      setIsProcessing(false);
    }
  };

  const resetTransforms = () => {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  };

  const hasChanges = rotation !== 0 || flipH || flipV;

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
          {/* Controls */}
          <div className="card">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                -90°
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <RotateCw className="w-4 h-4" />
                +90°
              </button>
              <button
                onClick={() => setFlipH(!flipH)}
                className={`btn flex items-center gap-2 ${flipH ? 'btn-primary' : 'btn-secondary'}`}
              >
                <FlipHorizontal className="w-4 h-4" />
                {t('rotate.mirrorH')}
              </button>
              <button
                onClick={() => setFlipV(!flipV)}
                className={`btn flex items-center gap-2 ${flipV ? 'btn-primary' : 'btn-secondary'}`}
              >
                <FlipVertical className="w-4 h-4" />
                {t('rotate.mirrorV')}
              </button>
              {hasChanges && (
                <button
                  onClick={resetTransforms}
                  className="btn btn-secondary flex items-center gap-2 text-orange-600"
                >
                  <RefreshCcw className="w-4 h-4" />
                  {t('common.reset')}
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              {t('rotate.rotation')}: {rotation}° | {t('rotate.mirrorH')}: {flipH ? t('rotate.yes') : t('rotate.no')} | {t('rotate.mirrorV')}: {flipV ? t('rotate.yes') : t('rotate.no')}
            </p>
          </div>

          {/* Preview */}
          <div className="card">
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => {
                  setImage(null);
                  setFileName('');
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 flex justify-center overflow-hidden">
              <img
                ref={imageRef}
                src={image}
                alt="Preview"
                style={{
                  maxHeight: '300px',
                  maxWidth: '100%',
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                  transition: 'transform 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              disabled={isProcessing}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isProcessing ? t('common.processing') : t('common.download')}
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}
