import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Image, FileText, Music, Video, Type, Shield, Zap, Lock, Wrench, Search, ArrowRight, Crop, Maximize, FileDown, RotateCw, Scissors, Volume2, QrCode, FolderArchive } from 'lucide-react';
import { categories } from '../utils/categories';
import { utilities } from '../utils/utilities';
import { useLanguage } from '../i18n';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Image,
  FileText,
  Music,
  Video,
  Type,
};

const utilityIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Crop,
  Maximize,
  FileDown,
  RotateCw,
  Scissors,
  Volume2,
  QrCode,
  FolderArchive,
  Type,
};

interface SearchResult {
  type: 'category' | 'utility' | 'format';
  title: string;
  description: string;
  url: string;
  icon?: string;
  color?: string;
}

export function Home() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const navigate = useNavigate();

  // Format keywords for search - reflects actual supported formats
  const formatKeywords: Record<string, { formats: string[]; categoryId: string }> = {
    images: { formats: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'bmp', 'pdf', 'image', 'photo', 'picture'], categoryId: 'images' },
    documents: { formats: ['pdf', 'docx', 'txt', 'csv', 'xlsx', 'xls', 'word', 'excel', 'document', 'text'], categoryId: 'documents' },
    audio: { formats: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'audio', 'music', 'sound'], categoryId: 'audio' },
    video: { formats: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'gif', 'video', 'movie', 'clip'], categoryId: 'video' },
    fonts: { formats: ['ttf', 'otf', 'woff', 'font', 'police', 'typography', 'schriftart'], categoryId: 'fonts' },
  };

  // Build search index
  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase().trim();
    const results: SearchResult[] = [];

    // Search in categories
    categories.forEach((cat) => {
      const label = t(cat.labelKey);
      const description = t(cat.descriptionKey);
      if (
        label.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        cat.id.toLowerCase().includes(query)
      ) {
        results.push({
          type: 'category',
          title: label,
          description: description,
          url: `/convert/${cat.id}`,
          icon: cat.icon,
          color: cat.color,
        });
      }
    });

    // Search in format keywords
    Object.entries(formatKeywords).forEach(([, data]) => {
      const cat = categories.find((c) => c.id === data.categoryId);
      if (!cat) return;

      const catLabel = t(cat.labelKey);
      data.formats.forEach((format) => {
        if (format.includes(query) || query.includes(format)) {
          results.push({
            type: 'format',
            title: format.toUpperCase(),
            description: `${t('home.convert')} ${format.toUpperCase()} - ${catLabel}`,
            url: `/convert/${cat.id}`,
            icon: cat.icon,
            color: cat.color,
          });
        }
      });
    });

    // Search in utilities
    utilities.forEach((util) => {
      const label = t(`utility.${util.id}`);
      const description = t(`utility.${util.id}.desc`);
      if (
        label.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        util.id.toLowerCase().includes(query)
      ) {
        results.push({
          type: 'utility',
          title: label,
          description: description,
          url: `/utility/${util.id}`,
          icon: util.icon,
        });
      }
    });

    // Remove duplicates and limit results
    const uniqueResults = results.filter(
      (result, index, self) =>
        index === self.findIndex((r) => r.url === result.url && r.title === result.title)
    );

    return uniqueResults.slice(0, 8);
  }, [searchQuery, t]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      navigate(searchResults[0].url);
      setSearchQuery('');
    }
  };

  const popularTools = [
    { label: 'PNG → JPG', url: '/convert/images' },
    { label: 'PDF → Image', url: '/convert/documents' },
    { label: 'Compresser image', url: '/utility/image-compress' },
    { label: 'MP4 → MP3', url: '/convert/audio' },
    { label: 'QR Code', url: '/utility/qr-code' },
  ];

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            {t('home.title')}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">
              {t('home.subtitle')}
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            {t('home.description')}
          </p>

          {/* Search bar */}
          <div className="max-w-xl mx-auto relative">
            <form onSubmit={handleSearchSubmit}>
              <div className={`relative transition-all ${isSearchFocused ? 'scale-105' : ''}`}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  placeholder={t('home.searchPlaceholder')}
                  className="w-full pl-12 pr-4 py-4 text-lg border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
                />
              </div>
            </form>

            {/* Search results dropdown */}
            {searchQuery && searchResults.length > 0 && isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
                {searchResults.map((result, index) => {
                  const Icon = result.icon
                    ? (result.type === 'utility' ? utilityIconMap[result.icon] : iconMap[result.icon])
                    : null;

                  return (
                    <Link
                      key={`${result.type}-${result.title}-${index}`}
                      to={result.url}
                      onClick={() => setSearchQuery('')}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      {Icon && (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          result.color
                            ? `bg-gradient-to-br ${result.color}`
                            : 'bg-gray-100'
                        }`}>
                          <Icon className={`w-5 h-5 ${result.color ? 'text-white' : 'text-gray-600'}`} />
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="font-medium text-gray-900">{result.title}</p>
                        <p className="text-sm text-gray-500">{result.description}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        result.type === 'category'
                          ? 'bg-blue-100 text-blue-700'
                          : result.type === 'utility'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {result.type === 'category' ? t('home.searchResult.conversion') : result.type === 'utility' ? t('home.searchResult.tool') : t('home.searchResult.format')}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Popular searches */}
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <span className="text-sm text-gray-500">{t('home.popular')}</span>
              {popularTools.map((tool) => (
                <Link
                  key={tool.label}
                  to={tool.url}
                  className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                >
                  {tool.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title={t('home.feature.private')}
            description={t('home.feature.privateDesc')}
          />
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title={t('home.feature.fast')}
            description={t('home.feature.fastDesc')}
          />
          <FeatureCard
            icon={<Lock className="w-6 h-6" />}
            title={t('home.feature.free')}
            description={t('home.feature.freeDesc')}
          />
        </div>

        {/* Categories */}
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          {t('home.whatToConvert')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>

        {/* Utilities Section - More prominent */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-primary-600 to-blue-600 p-8 md:p-12">
          {/* Background decoration */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-4">
                  <Wrench className="w-4 h-4 text-white" />
                  <span className="text-white text-sm font-medium">{t('home.toolbox')}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  {t('home.needOtherTools')}
                </h2>
                <p className="text-white/80 text-lg max-w-md">
                  {t('home.toolboxDesc')}
                </p>
              </div>

              <div className="flex flex-col items-center gap-4">
                {/* Quick utility icons */}
                <div className="flex gap-3">
                  {[
                    { icon: Crop, label: 'Recadrer' },
                    { icon: Maximize, label: 'Redimensionner' },
                    { icon: FileDown, label: 'Compresser' },
                    { icon: QrCode, label: 'QR Code' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center"
                      title={item.label}
                    >
                      <item.icon className="w-6 h-6 text-white" />
                    </div>
                  ))}
                </div>

                <Link
                  to="/utilities"
                  className="group flex items-center gap-3 bg-white text-primary-700 hover:bg-gray-100 px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-xl hover:shadow-2xl hover:scale-105"
                >
                  <Wrench className="w-5 h-5" />
                  {t('home.viewUtilities')}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card text-center">
      <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4 text-primary-600">
        {icon}
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

function CategoryCard({ category }: { category: typeof categories[0] }) {
  const { t } = useLanguage();
  const Icon = iconMap[category.icon];

  return (
    <Link
      to={`/convert/${category.id}`}
      className="card group hover:shadow-md transition-all duration-200 hover:-translate-y-1"
    >
      <div
        className={`w-12 h-12 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center mb-4`}
      >
        {Icon && <Icon className="w-6 h-6 text-white" />}
      </div>
      <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-primary-600 transition-colors">
        {t(category.labelKey)}
      </h3>
      <p className="text-sm text-gray-600">{t(category.descriptionKey)}</p>
    </Link>
  );
}
