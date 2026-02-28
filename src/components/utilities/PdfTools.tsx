import { useState, useCallback, useEffect } from 'react';
import { Upload, Download, X, RotateCw, FileText, Combine, Layers, Type, GripVertical, Check, RotateCcw, Undo2, ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { useLanguage } from '../../i18n';
import { formatSize } from '../../utils/formatSize';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type Tool = 'merge' | 'organize' | 'rotate' | 'pageNumbers' | 'imagesToPdf';

interface ImageFile {
  id: string;
  file: File;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

interface PageThumbnail {
  pageNum: number;
  dataUrl: string;
  width: number;
  height: number;
}

interface PdfFile {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount: number;
  thumbnails: PageThumbnail[];
  selectedPages: Set<number>;
  pageOrder: number[];
  initialPageOrder: number[];
  rotation: number;
}

export function PdfTools() {
  const { t } = useLanguage();
  const [tool, setTool] = useState<Tool>('merge');
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [initialFileOrder, setInitialFileOrder] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [pageNumberPosition, setPageNumberPosition] = useState<'bottom-center' | 'bottom-right' | 'top-center' | 'top-right'>('bottom-center');
  const [rangeInput, setRangeInput] = useState('');

  // History for undo
  const [history, setHistory] = useState<{ files: PdfFile[], fileOrder: string[] }[]>([]);

  // Images to PDF state
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dropImageTargetId, setDropImageTargetId] = useState<string | null>(null);
  const [dropImagePosition, setDropImagePosition] = useState<'before' | 'after' | null>(null);

  // Per-file expanded page pickers (merge tool)
  const [expandedPdfIds, setExpandedPdfIds] = useState<Set<string>>(new Set());
  const [perFileRangeInput, setPerFileRangeInput] = useState<Record<string, string>>({});
  // Track which files are currently loading thumbnails
  const [loadingThumbnailIds, setLoadingThumbnailIds] = useState<Set<string>>(new Set());

  // Drag state - simplified, no visual reordering during drag
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dropPageIndex, setDropPageIndex] = useState<number | null>(null);

  // Save state to history before changes
  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-9), { files: pdfFiles.map(f => ({ ...f, selectedPages: new Set(f.selectedPages) })), fileOrder: pdfFiles.map(f => f.id) }]);
  }, [pdfFiles]);

  // Undo last action
  const undo = useCallback(() => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setPdfFiles(lastState.files);
    setHistory(prev => prev.slice(0, -1));
  }, [history]);

  // Reset to initial state
  const resetFiles = useCallback(() => {
    if (tool === 'merge' && initialFileOrder.length > 0) {
      saveToHistory();
      const reordered = initialFileOrder
        .map(id => pdfFiles.find(f => f.id === id))
        .filter((f): f is PdfFile => f !== undefined);
      setPdfFiles(reordered);
    }
  }, [tool, initialFileOrder, pdfFiles, saveToHistory]);

  const resetPages = useCallback((pdfId: string) => {
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const allPages = new Set(Array.from({ length: f.pageCount }, (_, i) => i + 1));
      return { ...f, selectedPages: allPages, pageOrder: [...f.initialPageOrder] };
    }));
  }, [saveToHistory]);

  // Toggle the per-file page picker in merge view; lazy-load thumbnails
  const toggleExpandPdf = useCallback(async (pdfId: string) => {
    setExpandedPdfIds(prev => {
      const next = new Set(prev);
      if (next.has(pdfId)) {
        next.delete(pdfId);
      } else {
        next.add(pdfId);
        // Kick off thumbnail loading if not already loaded
        const pdf = pdfFiles.find(f => f.id === pdfId);
        if (pdf && pdf.thumbnails.length === 0) {
          setLoadingThumbnailIds(ids => { const s = new Set(ids); s.add(pdfId); return s; });
          generateThumbnails(pdf.file, pdf.pageCount).then(thumbs => {
            setPdfFiles(prev => prev.map(f => f.id === pdfId ? { ...f, thumbnails: thumbs } : f));
            setLoadingThumbnailIds(ids => { const s = new Set(ids); s.delete(pdfId); return s; });
          });
        }
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFiles]);

  // Apply a range string to a specific file's selectedPages (used in merge picker)
  const applyRangeToFile = useCallback((pdfId: string) => {
    const input = perFileRangeInput[pdfId] ?? '';
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const newSel = parseRange(input, f.pageCount);
      return newSel.size > 0 ? { ...f, selectedPages: newSel } : f;
    }));
  }, [perFileRangeInput, saveToHistory]);

  // Generate thumbnails for a PDF
  const generateThumbnails = async (file: File, pageCount: number): Promise<PageThumbnail[]> => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const thumbnails: PageThumbnail[] = [];
    const scale = 0.3;

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      thumbnails.push({
        pageNum: i,
        dataUrl: canvas.toDataURL('image/jpeg', 0.7),
        width: viewport.width,
        height: viewport.height,
      });
    }

    return thumbnails;
  };

  const loadPdf = useCallback(async (file: File): Promise<PdfFile> => {
    const buffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(buffer);
    const pageCount = pdf.getPageCount();
    const initialOrder = Array.from({ length: pageCount }, (_, i) => i + 1);

    return {
      id: Math.random().toString(36).substring(2, 11),
      file,
      name: file.name,
      size: file.size,
      pageCount,
      thumbnails: [],
      selectedPages: new Set(initialOrder),
      pageOrder: [...initialOrder],
      initialPageOrder: [...initialOrder],
      rotation: 0,
    };
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const pdfs = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

    const newFiles: PdfFile[] = [];
    for (const file of pdfs) {
      try {
        setIsLoadingThumbnails(true);
        const pdfFile = await loadPdf(file);

        if (tool !== 'merge') {
          pdfFile.thumbnails = await generateThumbnails(file, pdfFile.pageCount);
        }

        newFiles.push(pdfFile);
      } catch (err) {
        console.error('Failed to load PDF:', err);
      }
    }

    setPdfFiles(prev => {
      const updated = [...prev, ...newFiles];
      if (tool === 'merge' && prev.length === 0) {
        setInitialFileOrder(updated.map(f => f.id));
      }
      return updated;
    });
    setIsLoadingThumbnails(false);
  }, [loadPdf, tool]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];

    const newFiles: PdfFile[] = [];
    for (const file of files) {
      try {
        setIsLoadingThumbnails(true);
        const pdfFile = await loadPdf(file);

        if (tool !== 'merge') {
          pdfFile.thumbnails = await generateThumbnails(file, pdfFile.pageCount);
        }

        newFiles.push(pdfFile);
      } catch (err) {
        console.error('Failed to load PDF:', err);
      }
    }

    setPdfFiles(prev => {
      const updated = [...prev, ...newFiles];
      if (tool === 'merge' && prev.length === 0) {
        setInitialFileOrder(updated.map(f => f.id));
      }
      return updated;
    });
    setIsLoadingThumbnails(false);
    e.target.value = '';
  }, [loadPdf, tool]);

  // Load thumbnails when switching to a tool that needs them
  useEffect(() => {
    if ((tool === 'organize' || tool === 'rotate') && pdfFiles.length > 0) {
      const loadMissingThumbnails = async () => {
        setIsLoadingThumbnails(true);
        const updated = await Promise.all(
          pdfFiles.map(async (pdf) => {
            if (pdf.thumbnails.length === 0) {
              const thumbnails = await generateThumbnails(pdf.file, pdf.pageCount);
              return { ...pdf, thumbnails };
            }
            return pdf;
          })
        );
        setPdfFiles(updated);
        setIsLoadingThumbnails(false);
      };
      loadMissingThumbnails();
    }
  }, [tool]);

  const removePdf = (id: string) => {
    saveToHistory();
    setPdfFiles(prev => prev.filter(f => f.id !== id));
    setExpandedPdfIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    setPerFileRangeInput(prev => { const { [id]: _, ...rest } = prev; return rest; });
  };

  // Parse range string like "1-5, 8, 10-12"
  const parseRange = (input: string, maxPage: number): Set<number> => {
    const result = new Set<number>();
    const parts = input.split(',').map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.max(1, start); i <= Math.min(maxPage, end); i++) {
            result.add(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num) && num >= 1 && num <= maxPage) {
          result.add(num);
        }
      }
    }

    return result;
  };

  const applyRange = (pdfId: string) => {
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const newSelection = parseRange(rangeInput, f.pageCount);
      if (newSelection.size > 0) {
        return { ...f, selectedPages: newSelection, pageOrder: Array.from(newSelection).sort((a, b) => a - b) };
      }
      return f;
    }));
  };

  const togglePage = (pdfId: string, pageNum: number) => {
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const newSelected = new Set(f.selectedPages);
      if (newSelected.has(pageNum)) {
        newSelected.delete(pageNum);
      } else {
        newSelected.add(pageNum);
      }
      return {
        ...f,
        selectedPages: newSelected,
        pageOrder: f.pageOrder.filter(p => newSelected.has(p)).concat(
          Array.from(newSelected).filter(p => !f.pageOrder.includes(p)).sort((a, b) => a - b)
        )
      };
    }));
  };

  const selectAll = (pdfId: string) => {
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const allPages = new Set(Array.from({ length: f.pageCount }, (_, i) => i + 1));
      return { ...f, selectedPages: allPages, pageOrder: Array.from(allPages) };
    }));
  };

  const selectNone = (pdfId: string) => {
    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      return { ...f, selectedPages: new Set(), pageOrder: [] };
    }));
  };

  const setRotation = (pdfId: string, rotation: number) => {
    setPdfFiles(prev => prev.map(f => f.id === pdfId ? { ...f, rotation } : f));
  };

  // ============ FILE DRAG & DROP (for merge) - Improved ============
  const handleFileDragStart = (e: React.DragEvent, id: string) => {
    setDraggedFileId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Use a transparent drag image to avoid default ghost
    const dragImg = document.createElement('div');
    dragImg.style.opacity = '0';
    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, 0, 0);
    setTimeout(() => document.body.removeChild(dragImg), 0);
  };

  const handleFileDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedFileId === null || draggedFileId === id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';

    setDropTargetId(id);
    setDropPosition(position);
  };

  const handleFileDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the container entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFileId === null || dropTargetId === null || dropPosition === null) {
      resetDragState();
      return;
    }

    saveToHistory();
    setPdfFiles(prev => {
      const draggedIndex = prev.findIndex(f => f.id === draggedFileId);
      const targetIndex = prev.findIndex(f => f.id === dropTargetId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const newFiles = [...prev];
      const [draggedFile] = newFiles.splice(draggedIndex, 1);

      let insertIndex = targetIndex;
      if (draggedIndex < targetIndex) {
        insertIndex = dropPosition === 'after' ? targetIndex : targetIndex - 1;
      } else {
        insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;
      }

      newFiles.splice(insertIndex, 0, draggedFile);
      return newFiles;
    });

    resetDragState();
  };

  const resetDragState = () => {
    setDraggedFileId(null);
    setDropTargetId(null);
    setDropPosition(null);
    setDraggedPageIndex(null);
    setDropPageIndex(null);
  };

  // ============ PAGE DRAG & DROP (for organize) ============
  const handlePageDragStart = (e: React.DragEvent, index: number) => {
    setDraggedPageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedPageIndex === null || draggedPageIndex === index) return;
    setDropPageIndex(index);
  };

  const handlePageDrop = (pdfId: string) => {
    if (draggedPageIndex === null || dropPageIndex === null || draggedPageIndex === dropPageIndex) {
      resetDragState();
      return;
    }

    saveToHistory();
    setPdfFiles(prev => prev.map(f => {
      if (f.id !== pdfId) return f;
      const newOrder = [...f.pageOrder];
      const [draggedPage] = newOrder.splice(draggedPageIndex, 1);
      newOrder.splice(dropPageIndex, 0, draggedPage);
      return { ...f, pageOrder: newOrder };
    }));

    resetDragState();
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Merge PDFs – respects per-file selectedPages
  const mergePdfs = async () => {
    if (pdfFiles.length < 2) return;
    setIsProcessing(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const pdfFile of pdfFiles) {
        const buffer = await pdfFile.file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer);
        // Use selected pages (1-indexed) sorted asc, or all pages if none explicitly deselected
        const pageIndices = pdfFile.selectedPages.size > 0
          ? Array.from(pdfFile.selectedPages).sort((a, b) => a - b).map(p => p - 1)
          : pdf.getPageIndices();
        const pages = await mergedPdf.copyPages(pdf, pageIndices);
        pages.forEach(page => mergedPdf.addPage(page));
      }
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const baseName = pdfFiles[0].name.replace(/\.pdf$/i, '');
      downloadBlob(blob, `${baseName}_merged.pdf`);
    } catch (e) {
      console.error('Merge error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  // Organize pages
  const organizePdf = async () => {
    if (pdfFiles.length === 0) return;
    setIsProcessing(true);
    try {
      const pdfFile = pdfFiles[0];
      if (pdfFile.pageOrder.length === 0) {
        alert(t('pdfTools.selectAtLeastOne'));
        setIsProcessing(false);
        return;
      }

      const buffer = await pdfFile.file.arrayBuffer();
      const srcPdf = await PDFDocument.load(buffer);
      const newPdf = await PDFDocument.create();
      const pageIndices = pdfFile.pageOrder.map(p => p - 1);
      const pages = await newPdf.copyPages(srcPdf, pageIndices);
      pages.forEach(page => newPdf.addPage(page));
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      downloadBlob(blob, `${pdfFile.name.replace('.pdf', '')}_organized.pdf`);
    } catch (e) {
      console.error('Organize error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  // Rotate PDF pages
  const rotatePdf = async () => {
    if (pdfFiles.length === 0) return;
    setIsProcessing(true);
    try {
      const pdfFile = pdfFiles[0];
      const buffer = await pdfFile.file.arrayBuffer();
      const pdf = await PDFDocument.load(buffer);
      const pages = pdf.getPages();
      pdfFile.selectedPages.forEach(pageNum => {
        const page = pages[pageNum - 1];
        if (page) page.setRotation(degrees(pdfFile.rotation));
      });
      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      downloadBlob(blob, `${pdfFile.name.replace('.pdf', '')}_rotated.pdf`);
    } catch (e) {
      console.error('Rotate error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  // Add page numbers
  const addPageNumbers = async () => {
    if (pdfFiles.length === 0) return;
    setIsProcessing(true);
    try {
      const pdfFile = pdfFiles[0];
      const buffer = await pdfFile.file.arrayBuffer();
      const pdf = await PDFDocument.load(buffer);
      const pages = pdf.getPages();
      const font = await pdf.embedFont('Helvetica' as unknown as Parameters<typeof pdf.embedFont>[0]);

      pages.forEach((page, index) => {
        const { width, height } = page.getSize();
        const text = `${index + 1} / ${pages.length}`;
        const textWidth = font.widthOfTextAtSize(text, 10);

        let x = 0, y = 0;
        switch (pageNumberPosition) {
          case 'bottom-center': x = (width - textWidth) / 2; y = 20; break;
          case 'bottom-right': x = width - textWidth - 30; y = 20; break;
          case 'top-center': x = (width - textWidth) / 2; y = height - 30; break;
          case 'top-right': x = width - textWidth - 30; y = height - 30; break;
        }

        page.drawText(text, { x, y, size: 10, font });
      });

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      downloadBlob(blob, `${pdfFile.name.replace('.pdf', '')}_numbered.pdf`);
    } catch (e) {
      console.error('Page numbers error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  // Load image and get dimensions
  const loadImage = (file: File): Promise<ImageFile> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            id: Math.random().toString(36).substring(2, 11),
            file,
            name: file.name,
            dataUrl: e.target?.result as string,
            width: img.width,
            height: img.height,
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Handle image drop
  const handleImageDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));

    const newImages: ImageFile[] = [];
    for (const file of files) {
      try {
        const imageFile = await loadImage(file);
        newImages.push(imageFile);
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }
    setImageFiles(prev => [...prev, ...newImages]);
  }, []);

  // Handle image file input
  const handleImageFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));

    const newImages: ImageFile[] = [];
    for (const file of files) {
      try {
        const imageFile = await loadImage(file);
        newImages.push(imageFile);
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }
    setImageFiles(prev => [...prev, ...newImages]);
    e.target.value = '';
  }, []);

  // Image drag handlers
  const handleImageDragStart = (e: React.DragEvent, imageId: string) => {
    setDraggedImageId(imageId);
    e.dataTransfer.effectAllowed = 'move';
    const dragImg = document.createElement('div');
    dragImg.style.opacity = '0';
    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, 0, 0);
    setTimeout(() => document.body.removeChild(dragImg), 0);
  };

  const handleImageDragOver = (e: React.DragEvent, imageId: string) => {
    e.preventDefault();
    if (!draggedImageId || draggedImageId === imageId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.left + rect.width / 2;
    setDropImageTargetId(imageId);
    setDropImagePosition(e.clientX < midPoint ? 'before' : 'after');
  };

  const handleImageDragEnd = () => {
    if (draggedImageId && dropImageTargetId && dropImagePosition) {
      setImageFiles(prev => {
        const draggedIndex = prev.findIndex(img => img.id === draggedImageId);
        const targetIndex = prev.findIndex(img => img.id === dropImageTargetId);
        if (draggedIndex === -1 || targetIndex === -1) return prev;

        const newImages = [...prev];
        const [draggedImage] = newImages.splice(draggedIndex, 1);
        const insertIndex = dropImagePosition === 'before' ? targetIndex : targetIndex + 1;
        const adjustedIndex = draggedIndex < targetIndex ? insertIndex - 1 : insertIndex;
        newImages.splice(adjustedIndex, 0, draggedImage);
        return newImages;
      });
    }
    setDraggedImageId(null);
    setDropImageTargetId(null);
    setDropImagePosition(null);
  };

  // Create PDF from images
  const createPdfFromImages = async () => {
    if (imageFiles.length === 0) return;
    setIsProcessing(true);

    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
      });

      let isFirstPage = true;

      for (const imageFile of imageFiles) {
        // Determine orientation based on image dimensions
        const isLandscape = imageFile.width > imageFile.height;

        if (!isFirstPage) {
          pdf.addPage(undefined, isLandscape ? 'landscape' : 'portrait');
        } else {
          // Set first page orientation
          if (isLandscape) {
            pdf.deletePage(1);
            pdf.addPage(undefined, 'landscape');
          }
          isFirstPage = false;
        }

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;

        const maxWidth = pageWidth - 2 * margin;
        const maxHeight = pageHeight - 2 * margin;

        // Scale to fit
        const widthRatio = maxWidth / imageFile.width;
        const heightRatio = maxHeight / imageFile.height;
        const ratio = Math.min(widthRatio, heightRatio);

        const imgWidth = imageFile.width * ratio;
        const imgHeight = imageFile.height * ratio;

        // Center image on page
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        pdf.addImage(imageFile.dataUrl, 'JPEG', x, y, imgWidth, imgHeight);
      }

      const blob = pdf.output('blob');
      downloadBlob(blob, 'images.pdf');
    } catch (e) {
      console.error('Images to PDF error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'imagesToPdf', icon: <ImageIcon className="w-4 h-4" />, label: t('pdfTools.imagesToPdf') },
    { id: 'merge', icon: <Combine className="w-4 h-4" />, label: t('pdfTools.merge') },
    { id: 'organize', icon: <Layers className="w-4 h-4" />, label: t('pdfTools.organize') },
    { id: 'rotate', icon: <RotateCw className="w-4 h-4" />, label: t('pdfTools.rotate') },
    { id: 'pageNumbers', icon: <Type className="w-4 h-4" />, label: t('pdfTools.pageNumbers') },
  ];

  const handleAction = () => {
    switch (tool) {
      case 'imagesToPdf': createPdfFromImages(); break;
      case 'merge': mergePdfs(); break;
      case 'organize': organizePdf(); break;
      case 'rotate': rotatePdf(); break;
      case 'pageNumbers': addPageNumbers(); break;
    }
  };

  const currentPdf = pdfFiles[0];

  return (
    <div className="space-y-6">
      {/* Tool selector */}
      <div className="card">
        <div className="flex flex-wrap gap-2">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); setPdfFiles([]); setImageFiles([]); setRangeInput(''); setHistory([]); setInitialFileOrder([]); setExpandedPdfIds(new Set()); setPerFileRangeInput({}); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === t.id ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div className="card">
        {tool === 'imagesToPdf' ? (
          <label
            className={`dropzone flex flex-col items-center justify-center min-h-[150px] ${isDragging ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleImageDrop}
          >
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*"
              onChange={handleImageFileInput}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dropzone.dragHere')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">PNG, JPG, WebP, GIF ({t('pdfTools.multipleFiles')})</p>
          </label>
        ) : (
          <label
            className={`dropzone flex flex-col items-center justify-center min-h-[150px] ${isDragging ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
          >
            <input
              type="file"
              className="hidden"
              multiple={tool === 'merge'}
              accept=".pdf"
              onChange={handleFileInput}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dropzone.dragHere')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">PDF {tool === 'merge' && `(${t('pdfTools.multipleFiles')})`}</p>
          </label>
        )}
      </div>

      {isLoadingThumbnails && (
        <div className="card p-4 text-center">
          <p className="text-gray-600 dark:text-gray-400">{t('pdfTools.loadingPreviews')}</p>
        </div>
      )}

      {/* Images to PDF - Image grid */}
      {tool === 'imagesToPdf' && imageFiles.length > 0 && (
        <div className="card">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  {imageFiles.length} {imageFiles.length > 1 ? 'images' : 'image'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <GripVertical className="w-3 h-3" />
                  {t('pdfTools.dragToReorder')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setImageFiles([])}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('common.reset')}
            </button>
          </div>

          {/* Image grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {imageFiles.map((img, index) => (
              <div
                key={img.id}
                draggable
                onDragStart={(e) => handleImageDragStart(e, img.id)}
                onDragOver={(e) => handleImageDragOver(e, img.id)}
                onDragEnd={handleImageDragEnd}
                onDragLeave={() => { setDropImageTargetId(null); setDropImagePosition(null); }}
                className={`relative group cursor-grab active:cursor-grabbing rounded-xl overflow-hidden border-2 transition-all shadow-sm hover:shadow-md ${
                  draggedImageId === img.id ? 'opacity-50 border-primary-300 scale-95' :
                  dropImageTargetId === img.id ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
                }`}
              >
                {/* Drop indicator */}
                {dropImageTargetId === img.id && dropImagePosition === 'before' && (
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary-500 z-10 rounded-l" />
                )}
                {dropImageTargetId === img.id && dropImagePosition === 'after' && (
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-primary-500 z-10 rounded-r" />
                )}

                <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="w-full h-full object-contain p-1"
                    draggable={false}
                  />
                </div>

                {/* Page number badge */}
                <div className="absolute top-2 left-2 flex items-center justify-center w-6 h-6 bg-primary-500 text-white text-xs font-bold rounded-full shadow-md">
                  {index + 1}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageFiles(prev => prev.filter(i => i.id !== img.id));
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-500 rounded-full shadow-md opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* File name */}
                <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 py-1.5 px-2">
                  <p className="text-gray-700 dark:text-gray-300 text-xs font-medium truncate">
                    {img.name}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer info */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{t('pdfTools.dragToReorderPages')}</span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-green-500" />
              {imageFiles.length} page{imageFiles.length > 1 ? 's' : ''} PDF
            </span>
          </div>
        </div>
      )}

      {/* Merge - File list with per-file page picker */}
      {tool === 'merge' && pdfFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('pdfTools.dragToReorder')}</p>
            <div className="flex gap-2">
              {history.length > 0 && (
                <button onClick={undo} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  <Undo2 className="w-3 h-3" />{t('pdfTools.undo')}
                </button>
              )}
              <button onClick={resetFiles} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <RotateCcw className="w-3 h-3" />{t('pdfTools.reset')}
              </button>
            </div>
          </div>

          <div className="space-y-0" onDragOver={(e) => e.preventDefault()} onDrop={handleFileDrop} onDragLeave={handleFileDragLeave}>
            {pdfFiles.map((pdf) => {
              const isExpanded = expandedPdfIds.has(pdf.id);
              const isLoadingThumb = loadingThumbnailIds.has(pdf.id);
              const allSelected = pdf.selectedPages.size === pdf.pageCount;
              const noneSelected = pdf.selectedPages.size === 0;
              const selectionLabel = allSelected
                ? `${pdf.pageCount} p.`
                : noneSelected
                ? 'Aucune page'
                : `${pdf.selectedPages.size}/${pdf.pageCount} p.`;

              return (
                <div key={pdf.id}>
                  {dropTargetId === pdf.id && dropPosition === 'before' && draggedFileId !== pdf.id && (
                    <div className="h-1 bg-primary-500 rounded-full mx-2 my-1 animate-pulse" />
                  )}

                  <div
                    className={`card p-0 overflow-hidden my-2 transition-all duration-150 ${draggedFileId === pdf.id ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'}`}
                  >
                    {/* ── File row ── */}
                    <div
                      draggable
                      onDragStart={(e) => handleFileDragStart(e, pdf.id)}
                      onDragOver={(e) => handleFileDragOver(e, pdf.id)}
                      onDragEnd={resetDragState}
                      className="flex items-center gap-3 p-3 cursor-grab active:cursor-grabbing"
                    >
                      <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{pdf.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatSize(pdf.size)}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${allSelected ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : 'bg-primary-100 text-primary-700'}`}>
                            {selectionLabel}
                          </span>
                        </div>
                      </div>
                      {/* Toggle page picker */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpandPdf(pdf.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${isExpanded ? 'bg-primary-100 text-primary-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        title={isExpanded ? 'Masquer les pages' : 'Choisir les pages'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); removePdf(pdf.id); }} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* ── Page picker (expandable) ── */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3 bg-gray-50/60 dark:bg-gray-800/60">

                        {/* Quick actions + range input */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => selectAll(pdf.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${allSelected ? 'bg-primary-500 text-white border-primary-500' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-primary-300'}`}
                          >
                            Tout sélectionner
                          </button>
                          <button
                            onClick={() => selectNone(pdf.id)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${noneSelected ? 'bg-gray-500 text-white border-gray-500' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}
                          >
                            Aucune
                          </button>
                          <div className="flex flex-1 min-w-0 items-center gap-1">
                            <input
                              type="text"
                              value={perFileRangeInput[pdf.id] ?? ''}
                              onChange={(e) => setPerFileRangeInput(prev => ({ ...prev, [pdf.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && applyRangeToFile(pdf.id)}
                              placeholder="ex : 1-5, 8, 10-12"
                              className="flex-1 min-w-0 text-xs px-2.5 py-1 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-400 bg-white dark:bg-gray-800 dark:text-gray-100"
                            />
                            <button
                              onClick={() => applyRangeToFile(pdf.id)}
                              className="text-xs px-2.5 py-1 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors whitespace-nowrap"
                            >
                              Appliquer
                            </button>
                          </div>
                        </div>

                        {/* Thumbnails or number chips */}
                        {pdf.thumbnails.length > 0 ? (
                          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
                            {pdf.thumbnails.map((thumb) => {
                              const selected = pdf.selectedPages.has(thumb.pageNum);
                              return (
                                <button
                                  key={thumb.pageNum}
                                  onClick={() => togglePage(pdf.id, thumb.pageNum)}
                                  className={`relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all ${selected ? 'border-primary-500 ring-1 ring-primary-300' : 'border-gray-200 dark:border-gray-600 opacity-40 hover:opacity-70 hover:border-gray-300 dark:hover:border-gray-500'}`}
                                >
                                  <img src={thumb.dataUrl} alt={`p.${thumb.pageNum}`} className="w-full h-full object-cover" />
                                  {selected && (
                                    <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-primary-500 rounded-full flex items-center justify-center shadow">
                                      <Check className="w-2 h-2 text-white" />
                                    </div>
                                  )}
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center leading-[14px]">
                                    {thumb.pageNum}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: pdf.pageCount }, (_, i) => i + 1).map((pageNum) => {
                                const selected = pdf.selectedPages.has(pageNum);
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => togglePage(pdf.id, pageNum)}
                                    className={`w-8 h-8 text-xs font-medium rounded-lg border transition-all ${selected ? 'bg-primary-500 border-primary-600 text-white shadow-sm' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-300 hover:text-primary-600'}`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            {isLoadingThumb && (
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-1.5">
                                <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin" />
                                Chargement des aperçus…
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {dropTargetId === pdf.id && dropPosition === 'after' && draggedFileId !== pdf.id && (
                    <div className="h-1 bg-primary-500 rounded-full mx-2 my-1 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Organize - Visual page selection with thumbnails */}
      {tool === 'organize' && currentPdf && currentPdf.thumbnails.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{currentPdf.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{currentPdf.selectedPages.size} / {currentPdf.pageCount} pages</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <button
                  onClick={undo}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                  title={t('pdfTools.undo')}
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => resetPages(currentPdf.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                title={t('pdfTools.reset')}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={() => removePdf(currentPdf.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Range input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{t('pdfTools.pageRange')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="1-5, 8, 10-12"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={() => applyRange(currentPdf.id)}
                className="px-3 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors"
              >
                {t('pdfTools.apply')}
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => selectAll(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('pdfTools.selectAll')}
            </button>
            <button
              onClick={() => selectNone(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('pdfTools.selectNone')}
            </button>
          </div>

          {/* Page thumbnails - Selection */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('pdfTools.clickToSelect')}</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {currentPdf.thumbnails.map((thumb) => (
                <button
                  key={thumb.pageNum}
                  onClick={() => togglePage(currentPdf.id, thumb.pageNum)}
                  className={`
                    relative group aspect-[3/4] rounded-lg overflow-hidden border-2
                    transition-all duration-150
                    ${currentPdf.selectedPages.has(thumb.pageNum)
                      ? 'border-primary-500 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300 opacity-50 hover:opacity-75'
                    }
                  `}
                >
                  <img
                    src={thumb.dataUrl}
                    alt={`Page ${thumb.pageNum}`}
                    className="w-full h-full object-cover"
                  />
                  {currentPdf.selectedPages.has(thumb.pageNum) && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center">
                    {thumb.pageNum}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reorder selected pages */}
          {currentPdf.pageOrder.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('pdfTools.dragToReorderPages')}</p>
              <div
                className="flex flex-wrap gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg min-h-[100px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handlePageDrop(currentPdf.id)}
              >
                {currentPdf.pageOrder.map((pageNum, index) => {
                  const thumb = currentPdf.thumbnails.find(t => t.pageNum === pageNum);
                  if (!thumb) return null;

                  return (
                    <div key={`order-${pageNum}`} className="relative">
                      {/* Drop indicator */}
                      {dropPageIndex === index && draggedPageIndex !== null && draggedPageIndex !== index && (
                        <div className="absolute -left-1 top-0 bottom-0 w-1 bg-primary-500 rounded-full animate-pulse" />
                      )}
                      <div
                        draggable
                        onDragStart={(e) => handlePageDragStart(e, index)}
                        onDragOver={(e) => handlePageDragOver(e, index)}
                        onDragEnd={resetDragState}
                        className={`
                          relative w-16 aspect-[3/4] rounded-lg overflow-hidden border-2
                          cursor-grab active:cursor-grabbing
                          transition-all duration-150
                          ${draggedPageIndex === index
                            ? 'opacity-40 scale-95'
                            : 'border-gray-300 hover:border-primary-400 hover:shadow-md'
                          }
                        `}
                      >
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${pageNum}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center pointer-events-none">
                          {pageNum}
                        </div>
                        <div className="absolute top-0.5 left-0.5 pointer-events-none">
                          <GripVertical className="w-3 h-3 text-white drop-shadow-md" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('pdfTools.outputOrder')}: {currentPdf.pageOrder.join(' → ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rotate - Visual page selection */}
      {tool === 'rotate' && currentPdf && currentPdf.thumbnails.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-red-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{currentPdf.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{currentPdf.selectedPages.size} pages {t('pdfTools.selected')}</p>
              </div>
            </div>
            <button onClick={() => removePdf(currentPdf.id)} className="p-1.5 text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Rotation selector */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('pdfTools.rotationAngle')}</p>
            <div className="flex gap-2">
              {[90, 180, 270].map(angle => (
                <button
                  key={angle}
                  onClick={() => setRotation(currentPdf.id, angle)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm
                    transition-all duration-150
                    ${currentPdf.rotation === angle
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  <RotateCw
                    className="w-4 h-4 transition-transform duration-300"
                    style={{ transform: `rotate(${angle}deg)` }}
                  />
                  {angle}°
                </button>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => selectAll(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('pdfTools.selectAll')}
            </button>
            <button
              onClick={() => selectNone(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {t('pdfTools.selectNone')}
            </button>
          </div>

          {/* Page thumbnails */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('pdfTools.clickToSelect')}</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {currentPdf.thumbnails.map((thumb) => (
              <button
                key={thumb.pageNum}
                onClick={() => togglePage(currentPdf.id, thumb.pageNum)}
                className={`
                  relative group aspect-[3/4] rounded-lg overflow-hidden border-2
                  transition-all duration-150
                  ${currentPdf.selectedPages.has(thumb.pageNum)
                    ? 'border-primary-500 ring-2 ring-primary-200'
                    : 'border-gray-200 hover:border-gray-300 opacity-50 hover:opacity-75'
                  }
                `}
              >
                <img
                  src={thumb.dataUrl}
                  alt={`Page ${thumb.pageNum}`}
                  className="w-full h-full object-cover transition-transform duration-300"
                  style={{
                    transform: currentPdf.selectedPages.has(thumb.pageNum)
                      ? `rotate(${currentPdf.rotation}deg)`
                      : undefined
                  }}
                />
                {currentPdf.selectedPages.has(thumb.pageNum) && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center shadow-md">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-0.5 text-center">
                  {thumb.pageNum}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page numbers - Simple file list */}
      {tool === 'pageNumbers' && currentPdf && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{currentPdf.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatSize(currentPdf.size)} • {currentPdf.pageCount} pages</p>
              </div>
            </div>
            <button onClick={() => removePdf(currentPdf.id)} className="p-1.5 text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('pdfTools.position')}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['bottom-center', 'bottom-right', 'top-center', 'top-right'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setPageNumberPosition(pos)}
                  className={`
                    px-3 py-2 text-sm rounded-lg transition-all duration-150
                    ${pageNumberPosition === pos
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }
                  `}
                >
                  {t(`pdfTools.pos.${pos}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action button */}
      {(pdfFiles.length > 0 || (tool === 'imagesToPdf' && imageFiles.length > 0)) && (
        <button
          onClick={handleAction}
          disabled={isProcessing || (tool === 'merge' && pdfFiles.length < 2) || (tool === 'organize' && currentPdf?.pageOrder.length === 0) || (tool === 'imagesToPdf' && imageFiles.length === 0)}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
        >
          <Download className="w-4 h-4" />
          {isProcessing ? t('common.processing') : tool === 'imagesToPdf' ? t('pdfTools.createPdf') : t('pdfTools.download')}
        </button>
      )}
    </div>
  );
}
