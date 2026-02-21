import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, X, Merge, ArrowUp, ArrowDown, Music } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { formatSize } from '../../utils/formatSize';
import { useLanguage } from '../../i18n';
import { consumePendingFiles } from '../../stores/pendingFiles';

interface AudioItem {
  id: string;
  file: File;
  url: string;
}

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export function AudioMerge() {
  const { t } = useLanguage();
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<'mp3' | 'wav' | 'ogg'>('mp3');
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addAudioFiles = useCallback((files: File[]) => {
    const audioFiles = files.filter((f) => /^audio\//i.test(f.type));
    setAudios((prev) => [
      ...prev,
      ...audioFiles.map((file) => ({
        id: generateId(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setOutputUrl(null);
  }, []);

  useEffect(() => {
    const pending = consumePendingFiles();
    if (pending.length > 0) addAudioFiles(pending);
  }, [addAudioFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addAudioFiles(Array.from(e.dataTransfer.files));
    },
    [addAudioFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addAudioFiles(Array.from(e.target.files));
      e.target.value = '';
    },
    [addAudioFiles]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    inputRef.current?.click();
  }, []);

  const removeAudio = useCallback((id: string) => {
    setAudios((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((a) => a.id !== id);
    });
    setOutputUrl(null);
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setAudios((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setAudios((prev) => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  }, []);

  const handleMerge = async () => {
    if (audios.length < 2) return;
    setIsProcessing(true);
    setProgress(0);
    setOutputUrl(null);

    try {
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
        await ffmpegRef.current.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
        });
      }

      const ff = ffmpegRef.current;
      ff.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)));

      // Write all audio files
      const fileNames: string[] = [];
      for (let i = 0; i < audios.length; i++) {
        const ext = audios[i].file.name.split('.').pop() || 'mp3';
        const name = `input_${i}.${ext}`;
        await ff.writeFile(name, await fetchFile(audios[i].file));
        fileNames.push(name);
      }

      // Concat list
      const concatList = fileNames.map((n) => `file '${n}'`).join('\n');
      await ff.writeFile('list.txt', new TextEncoder().encode(concatList));

      const outFile = `output.${outputFormat}`;
      await ff.exec([
        '-f', 'concat', '-safe', '0',
        '-i', 'list.txt',
        outFile,
      ]);

      const data = await ff.readFile(outFile);
      const mimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
      const blob = new Blob([data as unknown as BlobPart], { type: mimeMap[outputFormat] });
      setOutputUrl(URL.createObjectURL(blob));

      // Cleanup
      for (const name of fileNames) await ff.deleteFile(name);
      await ff.deleteFile('list.txt');
      await ff.deleteFile(outFile);
    } catch (err) {
      console.error('Audio merge error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={handleDrop}
        onTouchEnd={handleTouchEnd}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="audio/*"
          onChange={handleFileSelect}
        />
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="font-medium text-gray-700">{t('merge.addAudios')}</p>
        <p className="text-sm text-gray-500 mt-1">{t('merge.audioFormats')}</p>
      </div>

      {/* Audio list */}
      {audios.length > 0 && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              {t('merge.order')} ({audios.length} {t('merge.files')})
            </h3>
            <p className="text-xs text-gray-500">{t('merge.orderHint')}</p>
          </div>

          {audios.map((audio, index) => (
            <div key={audio.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {index + 1}
              </span>
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{audio.file.name}</p>
                <p className="text-xs text-gray-500">{formatSize(audio.file.size)}</p>
              </div>
              <audio src={audio.url} controls className="hidden sm:block h-8 max-w-[140px]" />
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t('merge.moveUp')}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === audios.length - 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t('merge.moveDown')}
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeAudio(audio.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Output format + merge button */}
      {audios.length >= 2 && (
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">{t('merge.outputFormat')}</p>
            <div className="flex gap-2">
              {(['mp3', 'wav', 'ogg'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setOutputFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    outputFormat === fmt
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleMerge}
            disabled={isProcessing}
            className="btn btn-primary flex items-center gap-2 self-end"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('merge.merging')} {progress > 0 && `${progress}%`}
              </>
            ) : (
              <>
                <Merge className="w-4 h-4" />
                {t('merge.mergeAudios')}
              </>
            )}
          </button>
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm text-gray-500 w-10">{progress}%</span>
        </div>
      )}

      {audios.length === 1 && (
        <p className="text-sm text-amber-600 flex items-center gap-1.5">
          <span>⚠</span>
          {t('merge.needMoreAudios')}
        </p>
      )}

      {/* Result */}
      {outputUrl && (
        <div className="card border-green-200 bg-green-50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Music className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-900">{t('merge.done')}</p>
                <p className="text-sm text-green-700">{t('merge.audioDoneDesc')}</p>
              </div>
            </div>
            <a
              href={outputUrl}
              download={`merged_audio.${outputFormat}`}
              className="btn btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {t('merge.download')}
            </a>
          </div>
          <audio src={outputUrl} controls className="mt-4 w-full" />
        </div>
      )}
    </div>
  );
}
