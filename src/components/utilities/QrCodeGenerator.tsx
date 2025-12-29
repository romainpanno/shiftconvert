import { useState, useRef, useEffect, useCallback } from 'react';
import { Download, QrCode, X, Image } from 'lucide-react';
import QRCode from 'qrcode';
import { useLanguage } from '../../i18n';

type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'classy-rounded';
type EyeStyle = 'square' | 'rounded' | 'dots' | 'leaf';

interface QrSettings {
  text: string;
  size: number;
  margin: number;
  darkColor: string;
  lightColor: string;
  dotStyle: DotStyle;
  eyeStyle: EyeStyle;
  eyeColor: string;
  logo: string | null;
  logoSize: number;
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
}

export function QrCodeGenerator() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<QrSettings>({
    text: '',
    size: 300,
    margin: 2,
    darkColor: '#000000',
    lightColor: '#ffffff',
    dotStyle: 'square',
    eyeStyle: 'square',
    eyeColor: '#000000',
    logo: null,
    logoSize: 20,
    errorCorrection: 'H',
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const updateSetting = <K extends keyof QrSettings>(key: K, value: QrSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    radius: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + size - radius, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
    ctx.lineTo(x + size, y + size - radius);
    ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
    ctx.lineTo(x + radius, y + size);
    ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  };

  const drawDot = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    style: DotStyle
  ) => {
    const padding = size * 0.1;
    const innerSize = size - padding * 2;

    switch (style) {
      case 'square':
        ctx.fillRect(x, y, size, size);
        break;
      case 'rounded':
        drawRoundedRect(ctx, x + padding / 2, y + padding / 2, innerSize, innerSize * 0.3);
        break;
      case 'dots':
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, innerSize / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'classy':
        ctx.fillRect(x + padding, y + padding, innerSize, innerSize);
        break;
      case 'classy-rounded':
        drawRoundedRect(ctx, x + padding, y + padding, innerSize, innerSize * 0.2);
        break;
    }
  };

  const drawEye = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    moduleSize: number,
    style: EyeStyle,
    color: string
  ) => {
    const eyeSize = moduleSize * 7;
    const innerSize = moduleSize * 5;
    const coreSize = moduleSize * 3;

    ctx.fillStyle = color;

    switch (style) {
      case 'square':
        ctx.fillRect(x, y, eyeSize, eyeSize);
        ctx.fillStyle = settings.lightColor;
        ctx.fillRect(x + moduleSize, y + moduleSize, innerSize, innerSize);
        ctx.fillStyle = color;
        ctx.fillRect(x + moduleSize * 2, y + moduleSize * 2, coreSize, coreSize);
        break;
      case 'rounded':
        drawRoundedRect(ctx, x, y, eyeSize, moduleSize * 1.5);
        ctx.fillStyle = settings.lightColor;
        drawRoundedRect(ctx, x + moduleSize, y + moduleSize, innerSize, moduleSize);
        ctx.fillStyle = color;
        drawRoundedRect(ctx, x + moduleSize * 2, y + moduleSize * 2, coreSize, moduleSize * 0.8);
        break;
      case 'dots':
        drawRoundedRect(ctx, x, y, eyeSize, eyeSize / 2);
        ctx.fillStyle = settings.lightColor;
        drawRoundedRect(ctx, x + moduleSize, y + moduleSize, innerSize, innerSize / 2);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + eyeSize / 2, y + eyeSize / 2, coreSize / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'leaf':
        ctx.beginPath();
        ctx.moveTo(x, y + eyeSize);
        ctx.quadraticCurveTo(x, y, x + eyeSize, y);
        ctx.lineTo(x + eyeSize, y + eyeSize);
        ctx.quadraticCurveTo(x + eyeSize, y + eyeSize, x, y + eyeSize);
        ctx.fill();
        ctx.fillStyle = settings.lightColor;
        ctx.beginPath();
        ctx.moveTo(x + moduleSize, y + eyeSize - moduleSize);
        ctx.quadraticCurveTo(x + moduleSize, y + moduleSize, x + eyeSize - moduleSize, y + moduleSize);
        ctx.lineTo(x + eyeSize - moduleSize, y + eyeSize - moduleSize);
        ctx.quadraticCurveTo(x + eyeSize - moduleSize, y + eyeSize - moduleSize, x + moduleSize, y + eyeSize - moduleSize);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + moduleSize * 2, y + eyeSize - moduleSize * 2);
        ctx.quadraticCurveTo(x + moduleSize * 2, y + moduleSize * 2, x + eyeSize - moduleSize * 2, y + moduleSize * 2);
        ctx.lineTo(x + eyeSize - moduleSize * 2, y + eyeSize - moduleSize * 2);
        ctx.fill();
        break;
    }
  };

  const generateQrCode = useCallback(async () => {
    if (!canvasRef.current || !settings.text) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = settings.size;
    canvas.height = settings.size;

    // Fill background
    ctx.fillStyle = settings.lightColor;
    ctx.fillRect(0, 0, settings.size, settings.size);

    try {
      // Get QR code matrix
      const qrData = QRCode.create(settings.text, {
        errorCorrectionLevel: settings.errorCorrection,
      });
      const modules = qrData.modules;
      const moduleCount = modules.size;
      const moduleSize = (settings.size - settings.margin * 2 * (settings.size / moduleCount)) / moduleCount;
      const offset = settings.margin * moduleSize;

      // Draw data modules (excluding eyes)
      ctx.fillStyle = settings.darkColor;

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          // Skip eye positions
          const isTopLeftEye = row < 7 && col < 7;
          const isTopRightEye = row < 7 && col >= moduleCount - 7;
          const isBottomLeftEye = row >= moduleCount - 7 && col < 7;

          if (isTopLeftEye || isTopRightEye || isBottomLeftEye) continue;

          if (modules.get(row, col)) {
            const x = offset + col * moduleSize;
            const y = offset + row * moduleSize;
            drawDot(ctx, x, y, moduleSize, settings.dotStyle);
          }
        }
      }

      // Draw eyes with custom style
      drawEye(ctx, offset, offset, moduleSize, settings.eyeStyle, settings.eyeColor);
      drawEye(ctx, offset + (moduleCount - 7) * moduleSize, offset, moduleSize, settings.eyeStyle, settings.eyeColor);
      drawEye(ctx, offset, offset + (moduleCount - 7) * moduleSize, moduleSize, settings.eyeStyle, settings.eyeColor);

      // Draw logo if present
      if (settings.logo) {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const logoSize = (settings.size * settings.logoSize) / 100;
          const logoX = (settings.size - logoSize) / 2;
          const logoY = (settings.size - logoSize) / 2;

          // White background for logo
          ctx.fillStyle = settings.lightColor;
          const bgPadding = logoSize * 0.1;
          ctx.fillRect(logoX - bgPadding, logoY - bgPadding, logoSize + bgPadding * 2, logoSize + bgPadding * 2);

          ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
        };
        img.src = settings.logo;
      }
    } catch (error) {
      console.error('QR generation error:', error);
    }
  }, [settings]);

  useEffect(() => {
    generateQrCode();
  }, [generateQrCode]);

  const handleDownload = (format: 'png' | 'svg') => {
    if (!settings.text) return;

    if (format === 'png') {
      const canvas = canvasRef.current;
      if (canvas) {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qrcode.png';
        a.click();
      }
    } else {
      QRCode.toString(
        settings.text,
        {
          type: 'svg',
          width: settings.size,
          margin: settings.margin,
          color: { dark: settings.darkColor, light: settings.lightColor },
          errorCorrectionLevel: settings.errorCorrection,
        },
        (err: Error | null | undefined, svg: string) => {
          if (err) return;
          const blob = new Blob([svg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'qrcode.svg';
          a.click();
          URL.revokeObjectURL(url);
        }
      );
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        updateSetting('logo', ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const presets = [
    { label: 'URL', placeholder: 'https://example.com' },
    { label: 'Email', placeholder: 'mailto:email@example.com' },
    { labelKey: 'qrCode.preset.phone', placeholder: 'tel:+33123456789' },
    { label: 'SMS', placeholder: 'sms:+33123456789?body=Hello' },
    { label: 'WiFi', placeholder: 'WIFI:T:WPA;S:NetworkName;P:password;;' },
  ];

  const colorPresets = [
    { dark: '#000000', light: '#ffffff', nameKey: 'qrCode.color.classic' },
    { dark: '#1a365d', light: '#ebf8ff', nameKey: 'qrCode.color.blue' },
    { dark: '#22543d', light: '#f0fff4', nameKey: 'qrCode.color.green' },
    { dark: '#742a2a', light: '#fff5f5', nameKey: 'qrCode.color.red' },
    { dark: '#553c9a', light: '#faf5ff', nameKey: 'qrCode.color.purple' },
    { dark: '#744210', light: '#fffaf0', nameKey: 'qrCode.color.orange' },
  ];

  const dotStyles: { value: DotStyle; labelKey: string }[] = [
    { value: 'square', labelKey: 'qrCode.dot.square' },
    { value: 'rounded', labelKey: 'qrCode.dot.rounded' },
    { value: 'dots', labelKey: 'qrCode.dot.dots' },
    { value: 'classy', labelKey: 'qrCode.dot.classy' },
    { value: 'classy-rounded', labelKey: 'qrCode.dot.classyRounded' },
  ];

  const eyeStyles: { value: EyeStyle; labelKey: string }[] = [
    { value: 'square', labelKey: 'qrCode.eye.square' },
    { value: 'rounded', labelKey: 'qrCode.eye.rounded' },
    { value: 'dots', labelKey: 'qrCode.eye.dots' },
    { value: 'leaf', labelKey: 'qrCode.eye.leaf' },
  ];

  return (
    <div className="space-y-6">
      {/* Content input */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('qrCode.content')}
        </label>
        <textarea
          value={settings.text}
          onChange={(e) => updateSetting('text', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          rows={3}
          placeholder={t('qrCode.enterText')}
        />
        <div className="flex flex-wrap gap-2 mt-3">
          {presets.map((p) => (
            <button
              key={p.placeholder}
              onClick={() => updateSetting('text', p.placeholder)}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              {'labelKey' in p ? t(p.labelKey) : p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color presets */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          {t('qrCode.colorThemes')}
        </label>
        <div className="flex flex-wrap gap-2">
          {colorPresets.map((preset) => (
            <button
              key={preset.nameKey}
              onClick={() => {
                updateSetting('darkColor', preset.dark);
                updateSetting('lightColor', preset.light);
                updateSetting('eyeColor', preset.dark);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                settings.darkColor === preset.dark && settings.lightColor === preset.light
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ background: preset.dark }}
              />
              <span className="text-sm">{t(preset.nameKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom colors */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          {t('qrCode.customColors')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('qrCode.modules')}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.darkColor}
                onChange={(e) => updateSetting('darkColor', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={settings.darkColor}
                onChange={(e) => updateSetting('darkColor', e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('qrCode.background')}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.lightColor}
                onChange={(e) => updateSetting('lightColor', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={settings.lightColor}
                onChange={(e) => updateSetting('lightColor', e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('qrCode.eyes')}</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.eyeColor}
                onChange={(e) => updateSetting('eyeColor', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200"
              />
              <input
                type="text"
                value={settings.eyeColor}
                onChange={(e) => updateSetting('eyeColor', e.target.value)}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dot & Eye styles */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('qrCode.moduleStyle')}
            </label>
            <div className="flex flex-wrap gap-2">
              {dotStyles.map((style) => (
                <button
                  key={style.value}
                  onClick={() => updateSetting('dotStyle', style.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    settings.dotStyle === style.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {t(style.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              {t('qrCode.eyeStyle')}
            </label>
            <div className="flex flex-wrap gap-2">
              {eyeStyles.map((style) => (
                <button
                  key={style.value}
                  onClick={() => updateSetting('eyeStyle', style.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    settings.eyeStyle === style.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {t(style.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Size & Options */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('qrCode.size')} ({settings.size}px)
            </label>
            <div className="relative h-6 flex items-center">
              <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
              <div
                className="absolute h-1.5 bg-primary-500 rounded-full transition-all"
                style={{ width: `${((settings.size - 150) / 350) * 100}%` }}
              />
              <input
                type="range"
                min="150"
                max="500"
                step="10"
                value={settings.size}
                onChange={(e) => updateSetting('size', parseInt(e.target.value))}
                className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-2.5 h-5 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                style={{ left: `calc(${((settings.size - 150) / 350) * 100}% - 5px)` }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('qrCode.margin')} ({settings.margin})
            </label>
            <div className="relative h-6 flex items-center">
              <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
              <div
                className="absolute h-1.5 bg-primary-500 rounded-full transition-all"
                style={{ width: `${(settings.margin / 6) * 100}%` }}
              />
              <input
                type="range"
                min="0"
                max="6"
                step="1"
                value={settings.margin}
                onChange={(e) => updateSetting('margin', parseInt(e.target.value))}
                className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
              />
              <div
                className="absolute w-2.5 h-5 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                style={{ left: `calc(${(settings.margin / 6) * 100}% - 5px)` }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('qrCode.errorCorrection')}
            </label>
            <select
              value={settings.errorCorrection}
              onChange={(e) => updateSetting('errorCorrection', e.target.value as 'L' | 'M' | 'Q' | 'H')}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            >
              <option value="L">{t('qrCode.error.low')}</option>
              <option value="M">{t('qrCode.error.medium')}</option>
              <option value="Q">{t('qrCode.error.good')}</option>
              <option value="H">{t('qrCode.error.high')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logo upload */}
      <div className="card">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          {t('qrCode.logo')}
        </label>
        {settings.logo ? (
          <div className="flex items-center gap-4">
            <img
              src={settings.logo}
              alt="Logo"
              className="w-16 h-16 object-contain rounded-lg border border-gray-200"
            />
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">
                {t('qrCode.logoSize')} ({settings.logoSize}%)
              </label>
              <div className="relative h-6 flex items-center">
                <div className="absolute inset-x-0 h-1.5 bg-gray-200 rounded-full" />
                <div
                  className="absolute h-1.5 bg-primary-500 rounded-full transition-all"
                  style={{ width: `${((settings.logoSize - 10) / 25) * 100}%` }}
                />
                <input
                  type="range"
                  min="10"
                  max="35"
                  step="1"
                  value={settings.logoSize}
                  onChange={(e) => updateSetting('logoSize', parseInt(e.target.value))}
                  className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
                />
                <div
                  className="absolute w-2.5 h-5 bg-white border-2 border-primary-500 rounded-md shadow-md pointer-events-none transition-all"
                  style={{ left: `calc(${((settings.logoSize - 10) / 25) * 100}% - 5px)` }}
                />
              </div>
            </div>
            <button
              onClick={() => updateSetting('logo', null)}
              className="p-2 text-gray-400 hover:text-red-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => logoInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Image className="w-4 h-4" />
            <span className="text-sm">{t('qrCode.addLogo')}</span>
          </button>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={handleLogoUpload}
          className="hidden"
        />
        <p className="text-xs text-gray-500 mt-2">
          {t('qrCode.logoTip')}
        </p>
      </div>

      {/* Preview */}
      <div className="card flex flex-col items-center">
        {settings.text ? (
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-md"
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        ) : (
          <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
            <QrCode className="w-16 h-16 text-gray-300" />
          </div>
        )}
      </div>

      {/* Download buttons */}
      {settings.text && (
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => handleDownload('png')}
            className="btn btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            PNG
          </button>
          <button
            onClick={() => handleDownload('svg')}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            {t('qrCode.svgBasic')}
          </button>
        </div>
      )}
    </div>
  );
}
