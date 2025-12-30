import { useState, useCallback, useRef } from 'react';
import { Upload, Download, X, RotateCw, RotateCcw, FlipHorizontal, FlipVertical, RefreshCcw } from 'lucide-react';
import { useLanguage } from '../../i18n';

export function ImageRotate() {
  const { t } = useLanguage();
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const loadImage = useCallback((file: File) => {
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

  const handleDownload = async () => {
    if (!imageRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    const img = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isRotated90 = rotation === 90 || rotation === 270;
    canvas.width = isRotated90 ? img.naturalHeight : img.naturalWidth;
    canvas.height = isRotated90 ? img.naturalWidth : img.naturalHeight;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.[^.]+$/, '_rotated.png');
        a.click();
        URL.revokeObjectURL(url);
      }
      setIsProcessing(false);
    }, 'image/png');
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
