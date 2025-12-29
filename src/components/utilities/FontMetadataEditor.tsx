import { useState, useCallback } from 'react';
import { Upload, Download, Save, X } from 'lucide-react';
import { Font } from 'fonteditor-core';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';

interface FontFile {
  id: string;
  file: File;
  name: string;
  size: number;
  metadata: FontMetadata;
  editedMetadata: FontMetadata;
  modified: boolean;
}

interface FontMetadata {
  // Basic info
  fontFamily: string;
  fontSubFamily: string;
  fullName: string;
  version: string;
  postScriptName: string;
  uniqueSubFamily: string;
  // Creator info
  copyright: string;
  trademark: string;
  manufacturer: string;
  designer: string;
  description: string;
  // URLs
  urlVendor: string;
  urlDesigner: string;
  // License
  license: string;
  licenseUrl: string;
  // Extended
  preferredFamily: string;
  preferredSubFamily: string;
  compatibleFull: string;
  sampleText: string;
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

export function FontMetadataEditor() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<FontFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchEdit, setBatchEdit] = useState<Partial<FontMetadata>>({});

  const addFiles = useCallback(async (newFiles: File[]) => {
    const fontFiles: FontFile[] = [];

    for (const file of newFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const inputFormat = file.name.split('.').pop()?.toLowerCase() || 'ttf';
        const font = Font.create(buffer, {
          type: inputFormat as 'ttf' | 'otf' | 'woff' | 'eot',
        });

        const name = (font.data.name || {}) as Record<string, string>;
        const metadata: FontMetadata = {
          // Basic
          fontFamily: name.fontFamily || '',
          fontSubFamily: name.fontSubFamily || '',
          fullName: name.fullName || '',
          version: name.version || '',
          postScriptName: name.postScriptName || '',
          uniqueSubFamily: name.uniqueSubFamily || '',
          // Creator
          copyright: name.copyright || '',
          trademark: name.tradeMark || '',
          manufacturer: name.manufacturer || '',
          designer: name.designer || '',
          description: name.description || '',
          // URLs
          urlVendor: name.urlVendor || '',
          urlDesigner: name.urlDesigner || '',
          // License
          license: name.licence || '',
          licenseUrl: name.licenceUrl || '',
          // Extended
          preferredFamily: name.preferredFamily || '',
          preferredSubFamily: name.preferredSubFamily || '',
          compatibleFull: name.compatibleFull || '',
          sampleText: name.sampleText || '',
        };

        fontFiles.push({
          id: Math.random().toString(36).substring(2, 11),
          file,
          name: file.name,
          size: file.size,
          metadata,
          editedMetadata: { ...metadata },
          modified: false,
        });
      } catch (e) {
        console.error('Failed to read font:', e);
      }
    }

    setFiles((prev) => [...prev, ...fontFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
        /\.(ttf|otf|woff)$/i.test(f.name)
      );
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles]
  );

  const updateMetadata = (id: string, field: keyof FontMetadata, value: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              editedMetadata: { ...f.editedMetadata, [field]: value },
              modified: true,
            }
          : f
      )
    );
  };

  const applyBatchEdit = () => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        editedMetadata: {
          ...f.editedMetadata,
          ...Object.fromEntries(
            Object.entries(batchEdit).filter(([, v]) => v !== '')
          ),
        },
        modified: true,
      }))
    );
    setBatchEdit({});
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const saveFont = async (fontFile: FontFile) => {
    try {
      const buffer = await fontFile.file.arrayBuffer();
      const inputFormat = fontFile.file.name.split('.').pop()?.toLowerCase() || 'ttf';

      // OTF and EOT are not supported for writing, convert to TTF
      const outputFormat = (inputFormat === 'eot' || inputFormat === 'otf') ? 'ttf' : inputFormat;

      const font = Font.create(buffer, {
        type: inputFormat as 'ttf' | 'otf' | 'woff' | 'eot',
      });

      // Update name table with edited metadata
      const nameTable = (font.data.name || {}) as Record<string, string>;
      font.data.name = nameTable as typeof font.data.name;
      const meta = fontFile.editedMetadata;

      // Basic info
      nameTable.fontFamily = meta.fontFamily;
      nameTable.fontSubFamily = meta.fontSubFamily;
      nameTable.fullName = meta.fullName;
      nameTable.version = meta.version;
      nameTable.postScriptName = meta.postScriptName;
      nameTable.uniqueSubFamily = meta.uniqueSubFamily;
      // Creator info
      nameTable.copyright = meta.copyright;
      nameTable.tradeMark = meta.trademark;
      nameTable.manufacturer = meta.manufacturer;
      nameTable.designer = meta.designer;
      nameTable.description = meta.description;
      // URLs
      nameTable.urlVendor = meta.urlVendor;
      nameTable.urlDesigner = meta.urlDesigner;
      // License
      nameTable.licence = meta.license;
      nameTable.licenceUrl = meta.licenseUrl;
      // Extended
      nameTable.preferredFamily = meta.preferredFamily;
      nameTable.preferredSubFamily = meta.preferredSubFamily;
      nameTable.compatibleFull = meta.compatibleFull;
      nameTable.sampleText = meta.sampleText;

      const outputBuffer = font.write({
        type: outputFormat as 'ttf' | 'otf' | 'woff',
        hinting: true,
      });

      const blob = new Blob([outputBuffer as unknown as BlobPart], {
        type: `font/${outputFormat}`,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Update filename if format changed
      let downloadName = fontFile.name;
      if (inputFormat === 'eot') {
        downloadName = fontFile.name.replace(/\.eot$/i, '.ttf');
      } else if (inputFormat === 'otf') {
        downloadName = fontFile.name.replace(/\.otf$/i, '.ttf');
      }
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Error saving font:', error);
      alert(t('common.error'));
      return false;
    }
  };

  const saveAllFonts = async () => {
    setIsProcessing(true);
    for (const fontFile of files.filter((f) => f.modified)) {
      await saveFont(fontFile);
    }
    setIsProcessing(false);
  };

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

      {/* Batch edit */}
      {files.length > 1 && (
        <div className="card">
          <h3 className="font-medium text-gray-900 mb-4">
            Édition en lot ({files.length} fichiers)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Les champs remplis seront appliqués à tous les fichiers
          </p>
          {Object.keys(categoryLabels).map((category) => {
            const categoryFields = metadataFields.filter((f) => f.category === category);
            return (
              <div key={category} className="mb-4">
                <h4 className="text-xs font-medium text-gray-600 mb-2">
                  {categoryLabels[category]}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categoryFields.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type="text"
                        value={batchEdit[key] || ''}
                        onChange={(e) => setBatchEdit((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder={`Appliquer à tous...`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button
            onClick={applyBatchEdit}
            className="btn btn-secondary text-sm"
            disabled={Object.values(batchEdit).every((v) => !v)}
          >
            Appliquer à tous les fichiers
          </button>
        </div>
      )}

      {/* Files list */}
      {files.length > 0 && (
        <div className="space-y-4">
          {files.map((fontFile) => (
            <div key={fontFile.id} className="card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs">
                    {fontFile.name.split('.').pop()?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{fontFile.name}</p>
                    <p className="text-xs text-gray-500">{formatSize(fontFile.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {fontFile.modified && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      Modifié
                    </span>
                  )}
                  <button
                    onClick={() => saveFont(fontFile)}
                    className="btn btn-primary text-sm flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('fontMeta.save')}
                  </button>
                  <button
                    onClick={() => removeFile(fontFile.id)}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Group fields by category */}
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
                            value={fontFile.editedMetadata[key]}
                            onChange={(e) => updateMetadata(fontFile.id, key, e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Save all button */}
      {files.filter((f) => f.modified).length > 1 && (
        <div className="flex justify-center">
          <button
            onClick={saveAllFonts}
            disabled={isProcessing}
            className="btn btn-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isProcessing ? t('fontMeta.saving') : `${t('fontMeta.save')} (${files.filter((f) => f.modified).length})`}
          </button>
        </div>
      )}
    </div>
  );
}
