import type { ConverterConfig } from '../../types';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { renderAsync } from 'docx-preview';

// Configure PDF.js worker - use unpkg for reliable CDN access
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const documentConverter: ConverterConfig = {
  inputFormats: ['txt', 'doc', 'docx', 'pdf', 'csv', 'xlsx', 'xls'],
  outputFormats: ['pdf', 'txt', 'csv', 'xlsx'],

  // Define which output formats are available for each input format
  formatMap: {
    txt: ['pdf'],
    doc: ['pdf', 'txt'],
    docx: ['pdf', 'txt'],
    pdf: ['txt'],
    csv: ['xlsx', 'txt', 'pdf'],
    xlsx: ['csv', 'txt', 'pdf'],
    xls: ['csv', 'xlsx', 'txt', 'pdf'],
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

      throw new Error(`Conversion PDF → ${outputFormat.toUpperCase()} non supportée`);
    }

    // Spreadsheet conversions (CSV, XLSX, XLS)
    if (['csv', 'xlsx', 'xls'].includes(extension)) {
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();

      if (extension === 'csv') {
        const text = await file.text();
        const worksheet = workbook.addWorksheet('Sheet1');
        const rows = text.split('\n').map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
        rows.forEach(row => worksheet.addRow(row));
      } else {
        await workbook.xlsx.load(data);
      }
      onProgress?.(50);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No worksheet found in the file');
      }

      if (outputFormat === 'csv') {
        const csv = worksheetToCsv(worksheet);
        onProgress?.(100);
        return new Blob([csv], { type: 'text/csv' });
      }

      if (outputFormat === 'xlsx') {
        const buffer = await workbook.xlsx.writeBuffer();
        onProgress?.(100);
        return new Blob([new Uint8Array(buffer as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      if (outputFormat === 'txt') {
        const text = worksheetToText(worksheet);
        onProgress?.(100);
        return new Blob([text], { type: 'text/plain' });
      }

      if (outputFormat === 'pdf') {
        const csv = worksheetToCsv(worksheet);
        return textToPdf(csv, onProgress);
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

// Helper function to convert ExcelJS worksheet to CSV
function worksheetToCsv(worksheet: ExcelJS.Worksheet): string {
  const rows: string[] = [];
  worksheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      let value = cell.value?.toString() || '';
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      cells.push(value);
    });
    rows.push(cells.join(','));
  });
  return rows.join('\n');
}

// Helper function to convert ExcelJS worksheet to plain text
function worksheetToText(worksheet: ExcelJS.Worksheet): string {
  const rows: string[] = [];
  worksheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cell.value?.toString() || '');
    });
    rows.push(cells.join('\t'));
  });
  return rows.join('\n');
}
