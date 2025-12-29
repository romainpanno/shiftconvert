import { Link } from 'react-router-dom';
import { ArrowLeft, Type, Crop, Maximize2, Minimize2, RotateCw, Scissors, Music, Volume2, FolderArchive, FolderOpen, QrCode } from 'lucide-react';
import { utilities } from '../utils/utilities';
import { useLanguage } from '../i18n';

const iconMap: Record<string, React.ElementType> = {
  Type,
  Crop,
  Maximize2,
  Minimize2,
  RotateCw,
  Scissors,
  Music,
  Volume2,
  FolderArchive,
  FolderOpen,
  QrCode,
};

export function Utilities() {
  const { t } = useLanguage();

  const groupedUtilities = utilities.reduce((acc, utility) => {
    if (!acc[utility.category]) {
      acc[utility.category] = [];
    }
    acc[utility.category].push(utility);
    return acc;
  }, {} as Record<string, typeof utilities>);

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
            {t('utilities.back')}
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{t('utilities.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('utilities.subtitle')}
          </p>
        </div>

        {/* Utilities by category */}
        <div className="space-y-8">
          {Object.entries(groupedUtilities).map(([category, utils]) => (
            <div key={category}>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {t(`utilities.category.${category}`)}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {utils.map((utility) => {
                  const Icon = iconMap[utility.icon] || Type;
                  return (
                    <Link
                      key={utility.id}
                      to={`/utility/${utility.id}`}
                      className="card p-4 hover:shadow-md transition-shadow group"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg bg-gradient-to-br ${utility.color} flex items-center justify-center`}
                        >
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                            {t(`utility.${utility.id}`)}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {t(`utility.${utility.id}.desc`)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
