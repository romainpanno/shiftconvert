import { Link, useLocation } from 'react-router-dom';
import { Zap, Wrench, Globe, Menu, X, Home, Info, Sun, Moon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useLanguage, type Language } from '../../i18n';
import { useThemeStore, useIsDark } from '../../stores/themeStore';

export function Header() {
  const { t, language, setLanguage, languages, flags } = useLanguage();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { setTheme } = useThemeStore();
  const isDark = useIsDark();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <>
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 relative z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="hidden xs:inline">ShiftConvert</span>
            </Link>

            {/* Desktop navigation */}
            <nav className="hidden sm:flex items-center gap-6">
              <Link
                to="/"
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {t('nav.home')}
              </Link>
              <Link
                to="/utilities"
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center gap-1.5"
              >
                <Wrench className="w-4 h-4" />
                {t('nav.utilities')}
              </Link>
              <Link
                to="/about"
                className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {t('nav.about')}
              </Link>

              {/* Theme toggle - Desktop */}
              <button
                onClick={toggleTheme}
                className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Language selector - Desktop */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Globe className="w-4 h-4" />
                  <span className="text-base">{flags[language]}</span>
                </button>

                {langMenuOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    {(Object.keys(languages) as Language[]).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          setLanguage(lang);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                          language === lang
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span className="text-base">{flags[lang]}</span>
                        {languages[lang]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Mobile controls */}
            <div className="flex sm:hidden items-center gap-2">
              {/* Theme toggle - Mobile */}
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Language selector - Mobile (compact) */}
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="text-lg">{flags[language]}</span>
              </button>

              {/* Hamburger menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Mobile language dropdown */}
            {langMenuOpen && (
              <div className="sm:hidden absolute top-full right-4 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                {(Object.keys(languages) as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      setLanguage(lang);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      language === lang
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-base">{flags[lang]}</span>
                    {languages[lang]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile menu panel */}
      <div
        className={`sm:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg transform transition-transform duration-200 ease-out ${
          mobileMenuOpen ? 'translate-y-16' : '-translate-y-full'
        }`}
      >
        <nav className="max-w-6xl mx-auto px-4 py-4 space-y-1">
          <Link
            to="/"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
              location.pathname === '/'
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Home className="w-5 h-5" />
            {t('nav.home')}
          </Link>
          <Link
            to="/utilities"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
              location.pathname === '/utilities' || location.pathname.startsWith('/utility/')
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Wrench className="w-5 h-5" />
            {t('nav.utilities')}
          </Link>
          <Link
            to="/about"
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
              location.pathname === '/about'
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <Info className="w-5 h-5" />
            {t('nav.about')}
          </Link>
        </nav>
      </div>
    </>
  );
}
