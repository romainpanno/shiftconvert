import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getUtilityById } from '../utils/utilities';
import { useLanguage } from '../i18n';

// Utility components
import { FontMetadataEditor } from '../components/utilities/FontMetadataEditor';
import { ImageCrop } from '../components/utilities/ImageCrop';
import { ImageResize } from '../components/utilities/ImageResize';
import { ImageCompress } from '../components/utilities/ImageCompress';
import { ImageRotate } from '../components/utilities/ImageRotate';
import { VideoTrim } from '../components/utilities/VideoTrim';
import { VideoCrop } from '../components/utilities/VideoCrop';
import { VideoResize } from '../components/utilities/VideoResize';
import { VideoCompress } from '../components/utilities/VideoCompress';
import { VideoExtractAudio } from '../components/utilities/VideoExtractAudio';
import { AudioTrim } from '../components/utilities/AudioTrim';
import { AudioNormalize } from '../components/utilities/AudioNormalize';
import { CreateZip } from '../components/utilities/CreateZip';
import { ExtractZip } from '../components/utilities/ExtractZip';
import { QrCodeGenerator } from '../components/utilities/QrCodeGenerator';
import { PdfTools } from '../components/utilities/PdfTools';

const utilityComponents: Record<string, React.ComponentType> = {
  'font-metadata': FontMetadataEditor,
  'image-crop': ImageCrop,
  'image-resize': ImageResize,
  'image-compress': ImageCompress,
  'image-rotate': ImageRotate,
  'video-trim': VideoTrim,
  'video-crop': VideoCrop,
  'video-resize': VideoResize,
  'video-compress': VideoCompress,
  'video-extract-audio': VideoExtractAudio,
  'audio-trim': AudioTrim,
  'audio-normalize': AudioNormalize,
  'create-zip': CreateZip,
  'extract-zip': ExtractZip,
  'qr-code': QrCodeGenerator,
  'pdf-tools': PdfTools,
};

export function Utility() {
  const { t } = useLanguage();
  const { utilityId } = useParams<{ utilityId: string }>();
  const utility = getUtilityById(utilityId || '');
  const UtilityComponent = utilityId ? utilityComponents[utilityId] : null;

  if (!utility || !UtilityComponent) {
    return (
      <div className="py-12 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('utilities.notFound')}</h1>
        <Link to="/utilities" className="text-primary-600 hover:underline">
          {t('utilities.backToUtilities')}
        </Link>
      </div>
    );
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/utilities"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('utilities.backToUtilities')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t(`utility.${utility.id}`)}</h1>
          <p className="text-gray-600 mt-1">{t(`utility.${utility.id}.desc`)}</p>
        </div>

        {/* Utility content */}
        <UtilityComponent />
      </div>
    </div>
  );
}
