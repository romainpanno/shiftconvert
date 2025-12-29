import type { ConverterConfig } from '../../types';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import html2canvas from 'html2canvas';
import { renderAsync } from 'docx-preview';

// Configure PDF.js worker - use unpkg for reliable CDN access
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const documentConverter: ConverterConfig = {
  inputFormats: ['txt', 'doc', 'docx', 'pdf', 'csv', 'xlsx', 'xls'],
  outputFormats: ['pdf', 'txt', 'csv', 'xlsx', 'png', 'jpg'],

  // Define which output formats are available for each input format
  formatMap: {
    txt: ['pdf', 'png', 'jpg'],
    doc: ['pdf', 'txt', 'png', 'jpg'],
    docx: ['pdf', 'txt', 'png', 'jpg'],
    pdf: ['txt', 'png', 'jpg'],
    csv: ['xlsx', 'txt', 'pdf', 'png', 'jpg'],
    xlsx: ['csv', 'txt', 'pdf', 'png', 'jpg'],
    xls: ['csv', 'xlsx', 'txt', 'pdf', 'png', 'jpg'],
  },

  async convert(file: File, outputFormat: string, onProgress?: (progress: number) => void): Promise<Blob> {
    onProgress?.(10);

    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    // TXT conversions
    if (extension === 'txt') {
      const text = await file.text();
      onProgress?.(30);

      if (outputFormat === 'pdf') {
        return textToPdf(text, onProgress);
      }

      if (outputFormat === 'png' || outputFormat === 'jpg') {
        return textToImage(text, outputFormat, onProgress);
      }

      throw new Error(`Conversion TXT → ${outputFormat.toUpperCase()} non supportée`);
    }

    // DOC/DOCX conversions
    if (extension === 'doc' || extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      onProgress?.(30);

      // Check if it's a real DOCX (ZIP-based) by checking magic bytes
      const bytes = new Uint8Array(arrayBuffer.slice(0, 4));
      const isZipBased = bytes[0] === 0x50 && bytes[1] === 0x4B; // PK signature

      if (extension === 'doc' && !isZipBased) {
        throw new Error(
          'Le format .doc (Word 97-2003) n\'est pas supporté côté navigateur. ' +
          'Veuillez convertir votre fichier en .docx avec Microsoft Word ou LibreOffice, ' +
          'ou utilisez un service en ligne pour la conversion .doc → .docx.'
        );
      }

      if (outputFormat === 'txt') {
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          onProgress?.(100);
          return new Blob([result.value], { type: 'text/plain' });
        } catch {
          throw new Error('Impossible de lire ce fichier. Assurez-vous qu\'il s\'agit d\'un fichier Word valide (.docx).');
        }
      }

      if (outputFormat === 'pdf') {
        return docxToPdf(arrayBuffer, onProgress);
      }

      if (outputFormat === 'png' || outputFormat === 'jpg') {
        return docxToImage(arrayBuffer, outputFormat, onProgress);
      }

      throw new Error(`Conversion ${extension.toUpperCase()} → ${outputFormat.toUpperCase()} non supportée`);
    }

    // PDF conversions
    if (extension === 'pdf') {
      if (outputFormat === 'txt') {
        const arrayBuffer = await file.arrayBuffer();
        onProgress?.(20);
        const text = await extractTextFromPdf(arrayBuffer, onProgress);
        onProgress?.(100);
        return new Blob([text], { type: 'text/plain' });
      }

      if (outputFormat === 'png' || outputFormat === 'jpg') {
        const arrayBuffer = await file.arrayBuffer();
        onProgress?.(20);
        return pdfToImage(arrayBuffer, outputFormat, onProgress);
      }

      throw new Error(`Conversion PDF → ${outputFormat.toUpperCase()} non supportée`);
    }

    // Spreadsheet conversions (CSV, XLSX, XLS)
    if (['csv', 'xlsx', 'xls'].includes(extension)) {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      onProgress?.(50);

      if (outputFormat === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        onProgress?.(100);
        return new Blob([csv], { type: 'text/csv' });
      }

      if (outputFormat === 'xlsx') {
        const xlsxData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
        onProgress?.(100);
        return new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      if (outputFormat === 'txt') {
        const text = XLSX.utils.sheet_to_txt(workbook.Sheets[workbook.SheetNames[0]]);
        onProgress?.(100);
        return new Blob([text], { type: 'text/plain' });
      }

      if (outputFormat === 'pdf') {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
        return textToPdf(csv, onProgress);
      }

      if (outputFormat === 'png' || outputFormat === 'jpg') {
        return spreadsheetToImage(workbook, outputFormat, onProgress);
      }

      throw new Error(`Conversion ${extension.toUpperCase()} → ${outputFormat.toUpperCase()} non supportée`);
    }

    throw new Error(`Format d'entrée ${extension.toUpperCase()} non supporté`);
  },
};

async function docxToPdf(arrayBuffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<Blob> {
  // Create an iframe to isolate from page styles (avoids oklch color issues with html2canvas)
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 210mm;
    height: 297mm;
    border: none;
    background: white;
  `;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not create iframe for PDF rendering');
  }

  try {
    // Setup iframe document
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #ffffff; }
        </style>
      </head>
      <body><div id="docx-container"></div></body>
      </html>
    `);
    iframeDoc.close();

    const container = iframeDoc.getElementById('docx-container')!;

    // Render DOCX with docx-preview (much more faithful rendering)
    await renderAsync(arrayBuffer, container, undefined, {
      className: 'docx-preview',
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
      experimental: true, // Enable experimental features for better chart support
    });

    onProgress?.(50);

    // Wait for all images and SVGs to load (charts are often SVG)
    const images = container.querySelectorAll('img');
    const svgs = container.querySelectorAll('svg');

    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );

    // Wait for SVGs to be fully rendered
    if (svgs.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Wait for any canvas elements (charts might use canvas)
    const canvases = container.querySelectorAll('canvas');
    if (canvases.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Longer delay to ensure complex content (charts, shapes) is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 500));

    onProgress?.(60);

    // Get all pages (docx-preview creates sections for pages)
    const pages = container.querySelectorAll('section.docx');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 297;
    let isFirstPage = true;

    if (pages.length > 0) {
      // Multiple pages mode
      for (const page of Array.from(pages)) {
        const canvas = await html2canvas(page as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          allowTaint: true,
          foreignObjectRendering: true, // Better SVG/chart support
        });

        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (!isFirstPage) {
          pdf.addPage();
        }
        isFirstPage = false;

        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      }
    } else {
      // Single capture mode (fallback)
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        foreignObjectRendering: true, // Better SVG/chart support
      });

      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    onProgress?.(100);
    return pdf.output('blob');
  } finally {
    document.body.removeChild(iframe);
  }
}

async function extractTextFromPdf(arrayBuffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const textParts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    textParts.push(pageText);
    onProgress?.(20 + (i / numPages) * 70);
  }

  return textParts.join('\n\n');
}

async function textToPdf(text: string, onProgress?: (progress: number) => void): Promise<Blob> {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;

  const lines = pdf.splitTextToSize(text, maxWidth);
  onProgress?.(50);

  let y = margin;
  const lineHeight = 7;
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }

  onProgress?.(100);
  return pdf.output('blob');
}

async function textToImage(text: string, format: 'png' | 'jpg', onProgress?: (progress: number) => void): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Calculate dimensions
  const padding = 40;
  const lineHeight = 24;
  const fontSize = 16;
  const maxWidth = 800;

  ctx.font = `${fontSize}px monospace`;

  // Split text into lines that fit
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth - 2 * padding) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Handle newlines in original text
  const finalLines: string[] = [];
  for (const line of lines) {
    const subLines = line.split('\n');
    finalLines.push(...subLines);
  }

  onProgress?.(50);

  // Set canvas size
  canvas.width = maxWidth;
  canvas.height = Math.max(200, finalLines.length * lineHeight + 2 * padding);

  // Draw background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = '#1f2937';
  ctx.textBaseline = 'top';

  let y = padding;
  for (const line of finalLines) {
    ctx.fillText(line, padding, y);
    y += lineHeight;
  }

  onProgress?.(80);

  // Convert to blob
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      onProgress?.(100);
      resolve(blob!);
    }, mimeType, format === 'jpg' ? 0.95 : undefined);
  });
}

async function docxToImage(arrayBuffer: ArrayBuffer, format: 'png' | 'jpg', onProgress?: (progress: number) => void): Promise<Blob> {
  // Create an iframe to isolate from page styles
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 210mm;
    height: auto;
    border: none;
    background: white;
  `;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not create iframe for image rendering');
  }

  try {
    // Setup iframe document
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 20px; background: #ffffff; }
        </style>
      </head>
      <body><div id="docx-container"></div></body>
      </html>
    `);
    iframeDoc.close();

    const container = iframeDoc.getElementById('docx-container')!;

    // Render DOCX
    await renderAsync(arrayBuffer, container, undefined, {
      className: 'docx-preview',
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: false, // Single continuous page for image
      renderHeaders: true,
      renderFooters: true,
      useBase64URL: true,
    });

    onProgress?.(50);

    // Wait for images to load
    const images = container.querySelectorAll('img');
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          })
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    onProgress?.(70);

    // Render to canvas
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: true,
    });

    onProgress?.(90);

    // Convert to blob
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        onProgress?.(100);
        resolve(blob!);
      }, mimeType, format === 'jpg' ? 0.95 : undefined);
    });
  } finally {
    document.body.removeChild(iframe);
  }
}

async function pdfToImage(arrayBuffer: ArrayBuffer, format: 'png' | 'jpg', onProgress?: (progress: number) => void): Promise<Blob> {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  // Render all pages to canvases
  const pageCanvases: HTMLCanvasElement[] = [];
  const scale = 2; // High quality

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    pageCanvases.push(canvas);
    onProgress?.(30 + (i / numPages) * 50);
  }

  // Combine all pages into one image (stacked vertically)
  const totalHeight = pageCanvases.reduce((sum, c) => sum + c.height, 0);
  const maxWidth = Math.max(...pageCanvases.map((c) => c.width));
  const gap = 20;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = maxWidth;
  finalCanvas.height = totalHeight + gap * (numPages - 1);

  const finalCtx = finalCanvas.getContext('2d')!;
  finalCtx.fillStyle = '#e5e7eb'; // Gray background between pages
  finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

  let y = 0;
  for (const pageCanvas of pageCanvases) {
    // Center horizontally
    const x = (maxWidth - pageCanvas.width) / 2;
    finalCtx.drawImage(pageCanvas, x, y);
    y += pageCanvas.height + gap;
  }

  onProgress?.(90);

  // Convert to blob
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve) => {
    finalCanvas.toBlob((blob) => {
      onProgress?.(100);
      resolve(blob!);
    }, mimeType, format === 'jpg' ? 0.92 : undefined);
  });
}

async function spreadsheetToImage(workbook: XLSX.WorkBook, format: 'png' | 'jpg', onProgress?: (progress: number) => void): Promise<Blob> {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(sheet);

  onProgress?.(30);

  // Create container in iframe
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 1200px;
    height: auto;
    border: none;
    background: white;
  `;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('Could not create iframe for rendering');
  }

  try {
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 20px; background: #ffffff; font-family: Arial, sans-serif; }
          table { border-collapse: collapse; width: auto; }
          td, th {
            border: 1px solid #d1d5db;
            padding: 8px 12px;
            text-align: left;
            white-space: nowrap;
          }
          th { background: #f3f4f6; font-weight: 600; }
          tr:nth-child(even) { background: #f9fafb; }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `);
    iframeDoc.close();

    await new Promise((resolve) => setTimeout(resolve, 200));

    onProgress?.(60);

    // Render to canvas
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    onProgress?.(90);

    // Convert to blob
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        onProgress?.(100);
        resolve(blob!);
      }, mimeType, format === 'jpg' ? 0.95 : undefined);
    });
  } finally {
    document.body.removeChild(iframe);
  }
}
