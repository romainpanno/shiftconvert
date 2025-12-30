import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, Download, Trash2, Upload, X, ChevronDown, ChevronUp, Type, ArrowRight } from 'lucide-react';
import { formatSize } from '../utils/formatSize';
import { fontConverter, readFontMetadata, convertFontWithMetadata, type FontMetadata } from '../converters/fonts';
import { useLanguage } from '../i18n';

interface FontFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'idle' | 'converting' | 'done' | 'error';
  progress: number;
  outputUrl?: string;
  outputName?: string;
  convertedFormat?: string;
  error?: string;
  metadata?: FontMetadata;
  editedMetadata?: Partial<FontMetadata>;
}

const outputFormats = ['ttf', 'otf', 'woff'];

export function ConvertFonts() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<FontFile[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('woff');
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback(async (newFiles: File[]) => {
    const fontFiles: FontFile[] = [];

    for (const file of newFiles) {
      const id = Math.random().toString(36).substring(2, 11);
      let metadata: FontMetadata | undefined;

      try {
        metadata = await readFontMetadata(file);
      } catch (e) {
        console.error('Failed to read font metadata:', e);
      }

      fontFiles.push({
        id,
        file,
        name: file.name,
        size: file.size,
        status: 'idle',
        progress: 0,
        metadata,
        editedMetadata: metadata ? { ...metadata } : undefined,
      });
    }

    setFiles((prev) => [...prev.filter((f) => f.status !== 'done'), ...fontFiles]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.outputUrl) {
        URL.revokeObjectURL(file.outputUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearFiles = () => {
    files.forEach((f) => {
      if (f.outputUrl) URL.revokeObjectURL(f.outputUrl);
    });
    setFiles([]);
  };

  const updateMetadata = (id: string, field: keyof FontMetadata, value: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, editedMetadata: { ...f.editedMetadata, [field]: value } }
          : f
      )
    );
  };

  const handleConvert = async () => {
    setIsConverting(true);

    for (const fontFile of files) {
      if (fontFile.status === 'done') continue;

      setFiles((prev) =>
        prev.map((f) => (f.id === fontFile.id ? { ...f, status: 'converting', progress: 0 } : f))
      );

      try {
        const hasMetadataChanges =
          fontFile.editedMetadata &&
          fontFile.metadata &&
          Object.keys(fontFile.editedMetadata).some(
            (key) =>
              fontFile.editedMetadata![key as keyof FontMetadata] !==
              fontFile.metadata![key as keyof FontMetadata]
          );

        let result: Blob;

        if (hasMetadataChanges && fontFile.editedMetadata) {
          result = await convertFontWithMetadata(
            fontFile.file,
            selectedFormat,
            fontFile.editedMetadata,
            (progress) =>
              setFiles((prev) =>
                prev.map((f) => (f.id === fontFile.id ? { ...f, progress } : f))
              )
          );
        } else {
          result = await fontConverter.convert(
            fontFile.file,
            selectedFormat,
            (progress) =>
              setFiles((prev) =>
                prev.map((f) => (f.id === fontFile.id ? { ...f, progress } : f))
              )
          );
        }

        const outputName = fontFile.name.replace(/\.[^.]+$/, `.${selectedFormat}`);
        const url = URL.createObjectURL(result);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fontFile.id
              ? { ...f, status: 'done', progress: 100, outputUrl: url, outputName, convertedFormat: selectedFormat }
              : f
          )
        );
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fontFile.id
              ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Erreur' }
              : f
          )
        );
      }
    }

    setIsConverting(false);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles]
  );

  const hasFilesToConvert = files.some((f) => f.status !== 'done');
  const completedFiles = files.filter((f) => f.status === 'done');

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('convert.back')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t('convert.title')} {t('category.fonts')}</h1>
          <p className="text-gray-600 mt-1">{t('category.fonts.desc')}</p>
        </div>

        {/* Format selector */}
        <div className="card mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('convert.outputFormat')}
          </label>
          <div className="flex flex-wrap gap-2">
            {outputFormats.map((format) => (
              <button
                key={format}
                onClick={() => setSelectedFormat(format)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedFormat === format
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Dropzone */}
        <div className="card mb-6">
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
              accept=".ttf,.otf,.woff"
              onChange={(e) => {
                const selected = e.target.files ? Array.from(e.target.files) : [];
                if (selected.length > 0) addFiles(selected);
                e.target.value = '';
              }}
            />
            <Upload className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-base font-medium text-gray-700 mb-1">
              {t('dropzone.dragHere')}
            </p>
            <p className="text-sm text-gray-500">TTF, OTF, WOFF</p>
          </label>
        </div>

        {/* Tip for metadata editor */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Type className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <span className="text-sm text-blue-800">
                {t('convert.onlyEditMetadata')}
              </span>
            </div>
            <Link
              to="/utility/font-metadata"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {t('convert.goToMetadataEditor')}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Files list with metadata */}
        {files.length > 0 && (
          <div className="space-y-4 mb-6">
            {files.map((file) => (
              <FontFileCard
                key={file.id}
                file={file}
                onRemove={() => removeFile(file.id)}
                onUpdateMetadata={(field, value) => updateMetadata(file.id, field, value)}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {hasFilesToConvert && (
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
                onClick={() => {
                  completedFiles.forEach((f) => {
                    if (f.outputUrl && f.outputName) {
                      const a = document.createElement('a');
                      a.href = f.outputUrl;
                      a.download = f.outputName;
                      a.click();
                    }
                  });
                }}
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

const metadataFields: { key: keyof FontMetadata; label: string; category: string }[] = [
  // Basic
  { key: 'fontFamily', label: 'Famille', category: 'basic' },
  { key: 'fontSubFamily', label: 'Sous-famille', category: 'basic' },
  { key: 'fullName', label: 'Nom complet', category: 'basic' },
  { key: 'version', label: 'Version', category: 'basic' },
  { key: 'postScriptName', label: 'Nom PostScript', category: 'basic' },
  { key: 'uniqueSubFamily', label: 'ID unique', category: 'basic' },
  // Creator
  { key: 'copyright', label: 'Copyright', category: 'creator' },
  { key: 'trademark', label: 'Marque déposée', category: 'creator' },
  { key: 'manufacturer', label: 'Fabricant', category: 'creator' },
  { key: 'designer', label: 'Designer', category: 'creator' },
  { key: 'description', label: 'Description', category: 'creator' },
  // URLs
  { key: 'urlVendor', label: 'URL Fabricant', category: 'urls' },
  { key: 'urlDesigner', label: 'URL Designer', category: 'urls' },
  // License
  { key: 'license', label: 'Licence', category: 'license' },
  { key: 'licenseUrl', label: 'URL Licence', category: 'license' },
  // Extended
  { key: 'preferredFamily', label: 'Famille préférée', category: 'extended' },
  { key: 'preferredSubFamily', label: 'Sous-famille préférée', category: 'extended' },
  { key: 'compatibleFull', label: 'Nom compatible', category: 'extended' },
  { key: 'sampleText', label: 'Texte exemple', category: 'extended' },
];

const categoryLabels: Record<string, string> = {
  basic: 'Informations de base',
  creator: 'Créateur',
  urls: 'URLs',
  license: 'Licence',
  extended: 'Étendu',
};

function FontFileCard({
  file,
  onRemove,
  onUpdateMetadata,
}: {
  file: FontFile;
  onRemove: () => void;
  onUpdateMetadata: (field: keyof FontMetadata, value: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs">
          {file.name.split('.').pop()?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
          <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
        </div>

        {file.status === 'converting' && (
          <div className="flex items-center gap-2">
            <div className="w-20">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500">{Math.round(file.progress)}%</span>
          </div>
        )}

        {file.status === 'done' && file.outputUrl && (
          <a
            href={file.outputUrl}
            download={file.outputName}
            className="btn btn-primary text-sm flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {file.convertedFormat?.toUpperCase()}
          </a>
        )}

        {file.status === 'error' && (
          <span className="text-sm text-red-600">{file.error}</span>
        )}

        {file.metadata && file.status !== 'done' && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-500 hover:text-gray-700 p-1"
            title="Éditer les métadonnées"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        )}

        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 p-1"
          title="Supprimer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Metadata editor - organized by category */}
      {isExpanded && file.editedMetadata && file.status !== 'done' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {Object.keys(categoryLabels).map((category) => {
            const categoryFields = metadataFields.filter((f) => f.category === category);
            return (
              <div key={category} className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2 border-b border-gray-100 pb-1">
                  {categoryLabels[category]}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryFields.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type="text"
                        value={file.editedMetadata?.[key] || ''}
                        onChange={(e) => onUpdateMetadata(key, e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder={label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
