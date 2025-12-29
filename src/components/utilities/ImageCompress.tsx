import { useState, useCallback } from 'react';
import { Upload, Download, X, Gauge, Sparkles, FileDown } from 'lucide-react';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

export function ImageCompress() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<{ file: File; preview: string; compressed?: Blob; compressedUrl?: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState(80);
  const [isProcessing, setIsProcessing] = useState(false);

  const addFiles = useCallback((newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => /^image\//i.test(f.type));
    const filesWithPreview = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFiles((prev) => [...prev, ...filesWithPreview]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles]
  );

  const compressImages = async () => {
    setIsProcessing(true);

    const compressed = await Promise.all(
      files.map(async (item) => {
        const img = new Image();
        img.src = item.preview;
        await new Promise((resolve) => (img.onload = resolve));

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), 'image/jpeg', quality / 100)
        );

        return {
          ...item,
          compressed: blob,
          compressedUrl: URL.createObjectURL(blob),
        };
      })
    );

    setFiles(compressed);
    setIsProcessing(false);
  };

  const downloadAll = () => {
    files.forEach((item) => {
      if (item.compressedUrl) {
        const a = document.createElement('a');
        a.href = item.compressedUrl;
        a.download = item.file.name.replace(/\.[^.]+$/, '_compressed.jpg');
        a.click();
      }
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const file = prev[index];
      URL.revokeObjectURL(file.preview);
      if (file.compressedUrl) URL.revokeObjectURL(file.compressedUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const totalOriginal = files.reduce((acc, f) => acc + f.file.size, 0);
  const totalCompressed = files.reduce((acc, f) => acc + (f.compressed?.size || 0), 0);
  const savings = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

  const qualityPresets = [
    { label: t('compress.low'), value: 40 },
    { label: t('compress.medium'), value: 60 },
    { label: t('compress.high'), value: 80 },
    { label: t('compress.maximum'), value: 95 },
  ];

  const getQualityColor = () => {
    if (quality <= 40) return 'from-red-500 to-orange-500';
    if (quality <= 60) return 'from-orange-500 to-yellow-500';
    if (quality <= 80) return 'from-yellow-500 to-green-500';
    return 'from-green-500 to-emerald-500';
  };

  const getQualityLabel = () => {
    if (quality <= 40) return { text: t('compress.strongCompression'), color: 'text-red-600' };
    if (quality <= 60) return { text: t('compress.mediumCompression'), color: 'text-orange-600' };
    if (quality <= 80) return { text: t('compress.goodQuality'), color: 'text-green-600' };
    return { text: t('compress.maxQuality'), color: 'text-emerald-600' };
  };

  const qualityInfo = getQualityLabel();

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div className="card">
        <label
          className={`dropzone flex flex-col items-center justify-center min-h-[150px] ${
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
            multiple
            accept="image/*"
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          <Upload className="w-10 h-10 text-gray-400 mb-3" />
          <p className="text-base font-medium text-gray-700 mb-1">
            {t('dropzone.dragHere')}
          </p>
          <p className="text-sm text-gray-500">PNG, JPG, WebP</p>
        </label>
      </div>

      {files.length > 0 && (
        <>
          {/* Quality slider */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-gray-600" />
                <label className="text-sm font-medium text-gray-700">
                  {t('compress.quality')}
                </label>
              </div>
              <div className={`text-sm font-medium ${qualityInfo.color}`}>
                {qualityInfo.text}
              </div>
            </div>

            {/* Custom slider with bar thumb */}
            <div className="relative h-8 flex items-center mb-6">
              <div className="absolute inset-x-0 h-2 bg-gray-200 rounded-full" />
              <div
                className={`absolute h-2 bg-gradient-to-r ${getQualityColor()} rounded-full transition-all`}
                style={{ width: `${((quality - 10) / 90) * 100}%` }}
              />
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value))}
                className="absolute inset-x-0 w-full h-8 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-3 h-6 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                style={{ left: `calc(${((quality - 10) / 90) * 100}% - 6px)` }}
              />
              <div
                className="absolute top-8 transform -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-2 py-1 rounded-lg pointer-events-none"
                style={{ left: `${((quality - 10) / 90) * 100}%` }}
              >
                {quality}%
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
              </div>
            </div>

            {/* Labels */}
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span className="flex flex-col items-start">
                <span className="font-medium">{t('compress.smallSize')}</span>
                <span>{t('compress.lessQuality')}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-medium">{t('compress.largeSize')}</span>
                <span>{t('compress.betterQuality')}</span>
              </span>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-2 mt-6">
              {qualityPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setQuality(preset.value)}
                  className={`flex flex-col items-center p-3 rounded-xl transition-all ${
                    quality === preset.value
                      ? 'bg-primary-500 text-white shadow-lg scale-105'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  <span className="text-sm font-medium">{preset.label}</span>
                  <span className={`text-xs mt-0.5 ${quality === preset.value ? 'text-primary-100' : 'text-gray-500'}`}>
                    {preset.value}%
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Files list */}
          <div className="space-y-2">
            {files.map((item, index) => (
              <div key={index} className="card p-3 flex items-center gap-3">
                <div className="relative">
                  <img
                    src={item.preview}
                    alt=""
                    className="w-14 h-14 object-cover rounded-lg"
                  />
                  {item.compressed && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500">{formatSize(item.file.size)}</span>
                    {item.compressed && (
                      <>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-600 font-medium">
                          {formatSize(item.compressed.size)}
                        </span>
                        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                          -{Math.round((1 - item.compressed.size / item.file.size) * 100)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {item.compressedUrl && (
                  <a
                    href={item.compressedUrl}
                    download={item.file.name.replace(/\.[^.]+$/, '_compressed.jpg')}
                    className="btn btn-primary text-sm p-2"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Stats */}
          {totalCompressed > 0 && (
            <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
              <div className="flex items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{savings}%</span>
                </div>
                <div>
                  <p className="text-green-800 font-medium text-lg">{t('compress.spaceSaved')}</p>
                  <p className="text-green-600 text-sm">
                    {formatSize(totalOriginal)} → {formatSize(totalCompressed)}
                    <span className="ml-2 text-green-700 font-medium">
                      (-{formatSize(totalOriginal - totalCompressed)})
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={compressImages}
              disabled={isProcessing}
              className="btn btn-primary flex items-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              {isProcessing ? t('common.processing') : t('videoCompress.compress')}
            </button>
            {files.some((f) => f.compressed) && (
              <button onClick={downloadAll} className="btn btn-secondary flex items-center gap-2">
                <Download className="w-4 h-4" />
                {t('convert.downloadAll')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
