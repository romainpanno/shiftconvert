import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, RotateCcw } from 'lucide-react';
import { useLanguage } from '../../i18n';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ImageCrop() {
  const { t } = useLanguage();
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [cropArea, setCropArea] = useState<CropArea>({ x: 10, y: 10, width: 80, height: 80 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displayedImageBounds, setDisplayedImageBounds] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const loadImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });

        // Calculate initial crop based on image aspect ratio
        // Center a 80% crop area that respects the image proportions
        const margin = 10; // 10% margin on each side
        const cropW = 100 - margin * 2;
        const cropH = 100 - margin * 2;

        setCropArea({
          x: margin,
          y: margin,
          width: cropW,
          height: cropH
        });
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

  // Calculate the actual displayed image bounds within the container
  const updateDisplayedImageBounds = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;

    const img = imageRef.current;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    setDisplayedImageBounds({
      width: imgRect.width,
      height: imgRect.height,
      left: imgRect.left - containerRect.left,
      top: imgRect.top - containerRect.top,
    });
  }, []);

  // Update bounds when image loads
  useEffect(() => {
    if (image && imageRef.current) {
      const img = imageRef.current;
      if (img.complete) {
        updateDisplayedImageBounds();
      } else {
        img.onload = updateDisplayedImageBounds;
      }
    }
  }, [image, updateDisplayedImageBounds]);

  // Update bounds on window resize
  useEffect(() => {
    window.addEventListener('resize', updateDisplayedImageBounds);
    return () => window.removeEventListener('resize', updateDisplayedImageBounds);
  }, [updateDisplayedImageBounds]);

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handle);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleCropDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeHandle) return;
    setIsDraggingCrop(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!containerRef.current || displayedImageBounds.width === 0) return;

      // Use the displayed image bounds for calculating delta
      const deltaX = ((e.clientX - dragStart.x) / displayedImageBounds.width) * 100;
      const deltaY = ((e.clientY - dragStart.y) / displayedImageBounds.height) * 100;

      if (isDraggingCrop) {
        setCropArea((prev) => {
          let newX = prev.x + deltaX;
          let newY = prev.y + deltaY;

          newX = Math.max(0, Math.min(newX, 100 - prev.width));
          newY = Math.max(0, Math.min(newY, 100 - prev.height));

          return { ...prev, x: newX, y: newY };
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      } else if (activeHandle) {
        setCropArea((prev) => {
          let { x, y, width, height } = prev;

          if (activeHandle.includes('e')) {
            width = Math.max(5, Math.min(100 - x, width + deltaX));
          }
          if (activeHandle.includes('w')) {
            const maxMove = prev.x + prev.width - 5;
            const actualDeltaX = Math.min(deltaX, maxMove);
            if (width - actualDeltaX >= 5) {
              x = Math.max(0, x + actualDeltaX);
              width = prev.width - actualDeltaX;
            }
          }
          if (activeHandle.includes('s')) {
            height = Math.max(5, Math.min(100 - y, height + deltaY));
          }
          if (activeHandle.includes('n')) {
            const maxMove = prev.y + prev.height - 5;
            const actualDeltaY = Math.min(deltaY, maxMove);
            if (height - actualDeltaY >= 5) {
              y = Math.max(0, y + actualDeltaY);
              height = prev.height - actualDeltaY;
            }
          }

          // Apply aspect ratio constraint
          if (aspectRatio && activeHandle !== 'move') {
            const currentRatio = (width / 100 * imageSize.width) / (height / 100 * imageSize.height);
            if (currentRatio > aspectRatio) {
              width = (height / 100 * imageSize.height * aspectRatio) / imageSize.width * 100;
            } else {
              height = (width / 100 * imageSize.width / aspectRatio) / imageSize.height * 100;
            }
          }

          return { x, y, width, height };
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isDraggingCrop, activeHandle, dragStart, aspectRatio, imageSize, displayedImageBounds]
  );

  const handleMouseUp = useCallback(() => {
    setActiveHandle(null);
    setIsDraggingCrop(false);
  }, []);

  useEffect(() => {
    if (activeHandle || isDraggingCrop) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [activeHandle, isDraggingCrop, handleMouseMove, handleMouseUp]);

  const handleCrop = async () => {
    if (!imageRef.current || !canvasRef.current) return;

    setIsCropping(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const realX = (cropArea.x / 100) * imageSize.width;
    const realY = (cropArea.y / 100) * imageSize.height;
    const realWidth = (cropArea.width / 100) * imageSize.width;
    const realHeight = (cropArea.height / 100) * imageSize.height;

    canvas.width = realWidth;
    canvas.height = realHeight;

    ctx.drawImage(
      imageRef.current,
      realX,
      realY,
      realWidth,
      realHeight,
      0,
      0,
      realWidth,
      realHeight
    );

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.replace(/\.[^.]+$/, '_cropped.png');
        a.click();
        URL.revokeObjectURL(url);
      }
      setIsCropping(false);
    }, 'image/png');
  };

  const aspectRatios = [
    { label: t('crop.free'), value: null },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '16:9', value: 16 / 9 },
    { label: '3:2', value: 3 / 2 },
    { label: '2:3', value: 2 / 3 },
  ];

  const applyAspectRatio = (ratio: number | null) => {
    setAspectRatio(ratio);
    if (ratio) {
      setCropArea((prev) => {
        const currentWidth = (prev.width / 100) * imageSize.width;
        const newHeight = currentWidth / ratio;
        const newHeightPercent = (newHeight / imageSize.height) * 100;

        if (newHeightPercent > 100 - prev.y) {
          const maxHeight = 100 - prev.y;
          const maxHeightPx = (maxHeight / 100) * imageSize.height;
          const newWidthPx = maxHeightPx * ratio;
          return {
            ...prev,
            width: (newWidthPx / imageSize.width) * 100,
            height: maxHeight,
          };
        }

        return { ...prev, height: newHeightPercent };
      });
    }
  };

  const resetCrop = () => {
    const margin = 10;
    setCropArea({
      x: margin,
      y: margin,
      width: 100 - margin * 2,
      height: 100 - margin * 2
    });
    setAspectRatio(null);
  };

  const getCropPixels = () => {
    return {
      x: Math.round((cropArea.x / 100) * imageSize.width),
      y: Math.round((cropArea.y / 100) * imageSize.height),
      width: Math.round((cropArea.width / 100) * imageSize.width),
      height: Math.round((cropArea.height / 100) * imageSize.height),
    };
  };

  const pixels = getCropPixels();

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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-2">{t('crop.aspectRatio')}</label>
                <div className="flex flex-wrap gap-1">
                  {aspectRatios.map((ar) => (
                    <button
                      key={ar.label}
                      onClick={() => applyAspectRatio(ar.value)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                        aspectRatio === ar.value
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={resetCrop}
                className="btn btn-secondary text-sm flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t('common.reset')}
              </button>
            </div>
          </div>

          {/* Interactive crop area */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600">
                {t('crop.selection')}: {pixels.width} × {pixels.height}px
                <span className="text-gray-400 ml-2">
                  ({t('crop.position')}: {pixels.x}, {pixels.y})
                </span>
              </div>
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

            <div className="text-xs text-gray-500 mb-3">
              {t('crop.dragInstructions')}
            </div>

            <div
              ref={containerRef}
              className="relative bg-gray-900 rounded-lg overflow-hidden select-none"
              style={{ maxHeight: '500px' }}
            >
              <img
                ref={imageRef}
                src={image}
                alt="Preview"
                className="max-w-full max-h-[500px] mx-auto block"
                draggable={false}
                onLoad={updateDisplayedImageBounds}
              />

              {/* Overlay positioned over the image only */}
              {displayedImageBounds.width > 0 && (
                <div
                  ref={overlayRef}
                  className="absolute pointer-events-none"
                  style={{
                    left: displayedImageBounds.left,
                    top: displayedImageBounds.top,
                    width: displayedImageBounds.width,
                    height: displayedImageBounds.height,
                  }}
                >
                  {/* Dark overlay outside crop area */}
                  {/* Top */}
                  <div
                    className="absolute bg-black/60 left-0 right-0 top-0"
                    style={{ height: `${cropArea.y}%` }}
                  />
                  {/* Bottom */}
                  <div
                    className="absolute bg-black/60 left-0 right-0 bottom-0"
                    style={{ height: `${100 - cropArea.y - cropArea.height}%` }}
                  />
                  {/* Left */}
                  <div
                    className="absolute bg-black/60 left-0"
                    style={{
                      top: `${cropArea.y}%`,
                      width: `${cropArea.x}%`,
                      height: `${cropArea.height}%`,
                    }}
                  />
                  {/* Right */}
                  <div
                    className="absolute bg-black/60 right-0"
                    style={{
                      top: `${cropArea.y}%`,
                      width: `${100 - cropArea.x - cropArea.width}%`,
                      height: `${cropArea.height}%`,
                    }}
                  />
                </div>
              )}

              {/* Crop selection box - positioned over image */}
              {displayedImageBounds.width > 0 && (
                <div
                  className="absolute border-2 border-white cursor-move"
                  style={{
                    left: displayedImageBounds.left + (cropArea.x / 100) * displayedImageBounds.width,
                    top: displayedImageBounds.top + (cropArea.y / 100) * displayedImageBounds.height,
                    width: (cropArea.width / 100) * displayedImageBounds.width,
                    height: (cropArea.height / 100) * displayedImageBounds.height,
                  }}
                  onMouseDown={handleCropDragStart}
                >
                {/* Grid lines */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
                </div>

                {/* Resize handles */}
                {/* Corners */}
                <div
                  className="absolute -left-2 -top-2 w-4 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-nw-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'nw')}
                />
                <div
                  className="absolute -right-2 -top-2 w-4 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-ne-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'ne')}
                />
                <div
                  className="absolute -left-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-sw-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'sw')}
                />
                <div
                  className="absolute -right-2 -bottom-2 w-4 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-se-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'se')}
                />

                {/* Edge handles */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-2 w-8 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-n-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'n')}
                />
                <div
                  className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-8 h-4 bg-white border-2 border-primary-500 rounded-sm cursor-s-resize"
                  onMouseDown={(e) => handleMouseDown(e, 's')}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -left-2 w-4 h-8 bg-white border-2 border-primary-500 rounded-sm cursor-w-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'w')}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 -right-2 w-4 h-8 bg-white border-2 border-primary-500 rounded-sm cursor-e-resize"
                  onMouseDown={(e) => handleMouseDown(e, 'e')}
                />
              </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCrop}
              disabled={isCropping}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isCropping ? t('crop.cropping') : t('crop.download')}
            </button>
          </div>

          <canvas ref={canvasRef} className="hidden" />
        </>
      )}
    </div>
  );
}
