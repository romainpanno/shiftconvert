import type { ConverterConfig } from '../../types';

export const imageConverter: ConverterConfig = {
  inputFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic'],
  outputFormats: ['png', 'jpg', 'webp', 'gif'],

  async convert(file: File, outputFormat: string, onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(10);

    // Handle HEIC conversion
    let imageFile = file;
    if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
      const heic2any = (await import('heic2any')).default;
      const converted = await heic2any({ blob: file, toType: 'image/png' });
      imageFile = converted instanceof Blob ? new File([converted], file.name, { type: 'image/png' }) : new File([converted[0]], file.name, { type: 'image/png' });
    }

    onProgress?.(30);

    // Create canvas to convert format
    const img = await loadImage(imageFile);
    onProgress?.(50);

    // PDF output
    if (outputFormat === 'pdf') {
      return imageToPdf(img, onProgress);
    }

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');

    // Fill with white background for JPG (no transparency)
    if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0);
    onProgress?.(70);

    const mimeType = getMimeType(outputFormat);
    const quality = outputFormat === 'png' ? undefined : 0.92;

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            onProgress?.(100);
            resolve(blob);
          } else {
            reject(new Error('Failed to convert image'));
          }
        },
        mimeType,
        quality
      );
    });
  },
};

async function imageToPdf(img: HTMLImageElement, onProgress?: (progress: number) => void): Promise<Blob> {
  // Determine orientation based on image dimensions
  const isLandscape = img.width > img.height;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;

  // Calculate dimensions to fit image within page with margin
  const maxWidth = pageWidth - 2 * margin;
  const maxHeight = pageHeight - 2 * margin;

  let imgWidth = img.width;
  let imgHeight = img.height;

  // Scale to fit
  const widthRatio = maxWidth / imgWidth;
  const heightRatio = maxHeight / imgHeight;
  const ratio = Math.min(widthRatio, heightRatio);

  imgWidth *= ratio;
  imgHeight *= ratio;

  // Center image on page
  const x = (pageWidth - imgWidth) / 2;
  const y = (pageHeight - imgHeight) / 2;

  onProgress?.(70);

  // Convert image to base64
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);

  onProgress?.(100);
  return pdf.output('blob');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function getMimeType(format: string): string {
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return types[format] || 'image/png';
}
