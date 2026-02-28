import { Shield, Github } from 'lucide-react';
import { useLanguage } from '../../i18n';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Shield className="w-4 h-4 text-green-600 dark:text-green-500" />
            <span>{t('footer.privacy')}</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/romainpanno/shiftconvert"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ShiftConvert © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
