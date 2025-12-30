import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, Download, Trash2, AlertTriangle, Info, FileText, ArrowRight, Type } from 'lucide-react';
import { useConversionStore } from '../stores/conversionStore';
import { FileDropzone } from '../components/dropzone/FileDropzone';
import { getCategoryById } from '../utils/categories';
import { getConverterConfig } from '../converters';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useLanguage } from '../i18n';

export function Convert() {
  const { t } = useLanguage();
  const { category } = useParams<{ category: string }>();
  const categoryInfo = getCategoryById(category || '');
  const { files, selectedOutputFormat, setOutputFormat, clearFiles, updateFileStatus, updateFileOutput, updateFileError } = useConversionStore();
  const [isConverting, setIsConverting] = useState(false);
  const prevCategoryRef = useRef(category);

  const converterConfig = category ? getConverterConfig(category) : null;

  // Clear files when category changes
  useEffect(() => {
    if (prevCategoryRef.current !== category) {
      clearFiles();
      prevCategoryRef.current = category;
    }
  }, [category, clearFiles]);

  // Calculate available output formats based on uploaded files
  const availableOutputFormats = useMemo(() => {
    if (!converterConfig) return [];

    // If no files uploaded, show all output formats
    if (files.length === 0) {
      return converterConfig.outputFormats;
    }

    // If no formatMap defined, all formats are available
    if (!converterConfig.formatMap) {
      return converterConfig.outputFormats;
    }

    // Get unique input extensions from uploaded files
    const inputExtensions = new Set(
      files.map((f) => f.name.split('.').pop()?.toLowerCase() || '')
    );

    // Find formats that are available for ALL uploaded files
    let commonFormats: string[] | null = null;

    for (const ext of inputExtensions) {
      const formatsForExt = converterConfig.formatMap[ext];
      if (!formatsForExt) {
        // If no mapping for this extension, use all output formats
        continue;
      }

      if (commonFormats === null) {
        commonFormats = [...formatsForExt];
      } else {
        // Keep only formats that are common to all file types
        commonFormats = commonFormats.filter((f) => formatsForExt.includes(f));
      }
    }

    // If we found common formats, use them; otherwise use all output formats
    return commonFormats && commonFormats.length > 0
      ? commonFormats
      : converterConfig.outputFormats;
  }, [files, converterConfig]);

  // Get formats that are not available for current files (to show as disabled)
  const unavailableFormats = useMemo(() => {
    if (!converterConfig) return [];
    return converterConfig.outputFormats.filter(
      (f) => !availableOutputFormats.includes(f)
    );
  }, [converterConfig, availableOutputFormats]);

  // Reset output format when category changes or format is invalid for current files
  useEffect(() => {
    if (converterConfig && availableOutputFormats.length > 0) {
      const isValidFormat = selectedOutputFormat && availableOutputFormats.includes(selectedOutputFormat);
      if (!isValidFormat) {
        setOutputFormat(availableOutputFormats[0]);
      }
    }
  }, [converterConfig, availableOutputFormats, selectedOutputFormat, setOutputFormat, category]);

  if (!categoryInfo || !converterConfig) {
    return (
      <div className="py-12 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('convert.categoryNotFound')}</h1>
        <Link to="/" className="text-primary-600 hover:underline">
          {t('convert.backHome')}
        </Link>
      </div>
    );
  }

  const handleConvert = async () => {
    if (!selectedOutputFormat || files.length === 0) return;

    setIsConverting(true);

    for (const fileItem of files) {
      if (fileItem.status === 'done') continue;

      updateFileStatus(fileItem.id, 'converting', 0);

      try {
        const result = await converterConfig.convert(
          fileItem.file,
          selectedOutputFormat,
          (progress) => updateFileStatus(fileItem.id, 'converting', progress)
        );

        const outputName = fileItem.name.replace(/\.[^.]+$/, `.${selectedOutputFormat}`);
        const url = URL.createObjectURL(result);
        updateFileOutput(fileItem.id, url, outputName, selectedOutputFormat);
      } catch (error) {
        updateFileError(fileItem.id, error instanceof Error ? error.message : t('common.error'));
      }
    }

    setIsConverting(false);
  };

  const handleDownloadAll = () => {
    files.forEach((file) => {
      if (file.outputUrl && file.outputName) {
        const a = document.createElement('a');
        a.href = file.outputUrl;
        a.download = file.outputName;
        a.click();
      }
    });
  };

  const completedFiles = files.filter((f) => f.status === 'done');
  const hasFilesToConvert = files.some((f) => f.status !== 'done');
  const isValidFormat = selectedOutputFormat && availableOutputFormats.includes(selectedOutputFormat);

  // Get input format info for display
  const inputFormatsInfo = files.length > 0
    ? [...new Set(files.map((f) => f.name.split('.').pop()?.toUpperCase() || ''))]
    : null;

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('convert.back')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('convert.title')} {t(categoryInfo.labelKey)}
          </h1>
          <p className="text-gray-600 mt-1">{t(categoryInfo.descriptionKey)}</p>
          {categoryInfo.limitationsKey && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{t(categoryInfo.limitationsKey)}</span>
            </div>
          )}
        </div>

        {/* Dropzone - Move before format selector */}
        <div className="card mb-6">
          <FileDropzone acceptedFormats={converterConfig.inputFormats} />
        </div>

        {/* Format selector */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              {t('convert.outputFormat')}
            </label>
            {inputFormatsInfo && inputFormatsInfo.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Info className="w-3.5 h-3.5" />
                <span>
                  {t('convert.files')}: {inputFormatsInfo.join(', ')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Available formats */}
            {availableOutputFormats.map((format) => (
              <button
                key={format}
                onClick={() => setOutputFormat(format)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  selectedOutputFormat === format
                    ? 'bg-primary-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-[1.02]'
                }`}
              >
                {format.toUpperCase()}
              </button>
            ))}

            {/* Unavailable formats (grayed out) */}
            {unavailableFormats.length > 0 && files.length > 0 && (
              <>
                <div className="w-px bg-gray-200 mx-1" />
                {unavailableFormats.map((format) => (
                  <button
                    key={format}
                    disabled
                    title={`${t('convert.notAvailable')} ${inputFormatsInfo?.join(', ')}`}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-50 text-gray-300 cursor-not-allowed line-through"
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Helper text */}
          {files.length > 0 && unavailableFormats.length > 0 && (
            <p className="mt-3 text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {t('convert.someFormatsUnavailable')}
            </p>
          )}
        </div>

        {/* Tip for images to PDF */}
        {category === 'images' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-800">
                  {t('convert.multipleImagesToPdf')}
                </span>
              </div>
              <Link
                to="/utility/pdf-tools"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {t('convert.goToPdfTools')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Tip for font metadata */}
        {category === 'fonts' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Type className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-800">
                  {t('convert.editFontMetadata')}
                </span>
              </div>
              <Link
                to="/utility/font-metadata"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                {t('convert.goToFontMetadata')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Actions */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {hasFilesToConvert && isValidFormat && (
              <button
                onClick={handleConvert}
                disabled={isConverting}
                className="btn btn-primary flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isConverting ? t('convert.converting') : t('convert.convert')}
              </button>
            )}

            {completedFiles.length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t('convert.downloadAll')}
              </button>
            )}

            <button
              onClick={clearFiles}
              className="btn btn-secondary flex items-center gap-2 text-red-600"
            >
              <Trash2 className="w-4 h-4" />
              {t('convert.clearAll')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
