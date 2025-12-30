import { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Download, X, RotateCw, FileText, Combine, Layers, Type, GripVertical, Check, RotateCcw, Undo2 } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { useLanguage } from '../../i18n';
import { formatSize } from '../../utils/formatSize';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

type Tool = 'merge' | 'organize' | 'rotate' | 'pageNumbers';

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

      await page.render({ canvasContext: ctx, viewport }).promise;

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

  // Merge PDFs
  const mergePdfs = async () => {
    if (pdfFiles.length < 2) return;
    setIsProcessing(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const pdfFile of pdfFiles) {
        const buffer = await pdfFile.file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
      }
      const blob = new Blob([await mergedPdf.save()], { type: 'application/pdf' });
      downloadBlob(blob, 'merged.pdf');
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
      const blob = new Blob([await newPdf.save()], { type: 'application/pdf' });
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
      const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
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

      const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
      downloadBlob(blob, `${pdfFile.name.replace('.pdf', '')}_numbered.pdf`);
    } catch (e) {
      console.error('Page numbers error:', e);
      alert(t('common.error'));
    }
    setIsProcessing(false);
  };

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'merge', icon: <Combine className="w-4 h-4" />, label: t('pdfTools.merge') },
    { id: 'organize', icon: <Layers className="w-4 h-4" />, label: t('pdfTools.organize') },
    { id: 'rotate', icon: <RotateCw className="w-4 h-4" />, label: t('pdfTools.rotate') },
    { id: 'pageNumbers', icon: <Type className="w-4 h-4" />, label: t('pdfTools.pageNumbers') },
  ];

  const handleAction = () => {
    switch (tool) {
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
              onClick={() => { setTool(t.id); setPdfFiles([]); setRangeInput(''); setHistory([]); setInitialFileOrder([]); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tool === t.id ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          <p className="text-base font-medium text-gray-700 mb-1">{t('dropzone.dragHere')}</p>
          <p className="text-sm text-gray-500">PDF {tool === 'merge' && `(${t('pdfTools.multipleFiles')})`}</p>
        </label>
      </div>

      {isLoadingThumbnails && (
        <div className="card p-4 text-center">
          <p className="text-gray-600">{t('pdfTools.loadingPreviews')}</p>
        </div>
      )}

      {/* Merge - File list with drop indicator */}
      {tool === 'merge' && pdfFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">{t('pdfTools.dragToReorder')}</p>
            <div className="flex gap-2">
              {history.length > 0 && (
                <button
                  onClick={undo}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                  title={t('pdfTools.undo')}
                >
                  <Undo2 className="w-3 h-3" />
                  {t('pdfTools.undo')}
                </button>
              )}
              <button
                onClick={resetFiles}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                title={t('pdfTools.reset')}
              >
                <RotateCcw className="w-3 h-3" />
                {t('pdfTools.reset')}
              </button>
            </div>
          </div>

          <div
            className="space-y-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onDragLeave={handleFileDragLeave}
          >
            {pdfFiles.map((pdf, index) => (
              <div key={pdf.id}>
                {/* Drop indicator before */}
                {dropTargetId === pdf.id && dropPosition === 'before' && draggedFileId !== pdf.id && (
                  <div className="h-1 bg-primary-500 rounded-full mx-2 my-1 animate-pulse" />
                )}

                <div
                  draggable
                  onDragStart={(e) => handleFileDragStart(e, pdf.id)}
                  onDragOver={(e) => handleFileDragOver(e, pdf.id)}
                  onDragEnd={resetDragState}
                  className={`
                    card p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing my-2
                    transition-all duration-150
                    ${draggedFileId === pdf.id ? 'opacity-40 scale-[0.98]' : 'hover:shadow-md'}
                  `}
                >
                  <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{pdf.name}</p>
                    <p className="text-xs text-gray-500">{formatSize(pdf.size)} • {pdf.pageCount} pages</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removePdf(pdf.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Drop indicator after */}
                {dropTargetId === pdf.id && dropPosition === 'after' && draggedFileId !== pdf.id && (
                  <div className="h-1 bg-primary-500 rounded-full mx-2 my-1 animate-pulse" />
                )}
              </div>
            ))}
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
                <p className="font-medium text-gray-900">{currentPdf.name}</p>
                <p className="text-xs text-gray-500">{currentPdf.selectedPages.size} / {currentPdf.pageCount} pages</p>
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
            <label className="block text-sm text-gray-600 mb-1">{t('pdfTools.pageRange')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                placeholder="1-5, 8, 10-12"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {t('pdfTools.selectAll')}
            </button>
            <button
              onClick={() => selectNone(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {t('pdfTools.selectNone')}
            </button>
          </div>

          {/* Page thumbnails - Selection */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">{t('pdfTools.clickToSelect')}</p>
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
              <p className="text-sm text-gray-600 mb-2">{t('pdfTools.dragToReorderPages')}</p>
              <div
                className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg min-h-[100px]"
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
              <p className="text-xs text-gray-400 mt-2">
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
                <p className="font-medium text-gray-900">{currentPdf.name}</p>
                <p className="text-xs text-gray-500">{currentPdf.selectedPages.size} pages {t('pdfTools.selected')}</p>
              </div>
            </div>
            <button onClick={() => removePdf(currentPdf.id)} className="p-1.5 text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Rotation selector */}
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">{t('pdfTools.rotationAngle')}</p>
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
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {t('pdfTools.selectAll')}
            </button>
            <button
              onClick={() => selectNone(currentPdf.id)}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              {t('pdfTools.selectNone')}
            </button>
          </div>

          {/* Page thumbnails */}
          <p className="text-sm text-gray-600 mb-2">{t('pdfTools.clickToSelect')}</p>
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
                <p className="font-medium text-gray-900">{currentPdf.name}</p>
                <p className="text-xs text-gray-500">{formatSize(currentPdf.size)} • {currentPdf.pageCount} pages</p>
              </div>
            </div>
            <button onClick={() => removePdf(currentPdf.id)} className="p-1.5 text-gray-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('pdfTools.position')}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['bottom-center', 'bottom-right', 'top-center', 'top-right'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setPageNumberPosition(pos)}
                  className={`
                    px-3 py-2 text-sm rounded-lg transition-all duration-150
                    ${pageNumberPosition === pos
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
      {pdfFiles.length > 0 && (
        <button
          onClick={handleAction}
          disabled={isProcessing || (tool === 'merge' && pdfFiles.length < 2) || (tool === 'organize' && currentPdf?.pageOrder.length === 0)}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
        >
          <Download className="w-4 h-4" />
          {isProcessing ? t('common.processing') : t('pdfTools.download')}
        </button>
      )}
    </div>
  );
}
