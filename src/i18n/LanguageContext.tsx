import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { translations, languageNames, languageFlags, type Language } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  languages: typeof languageNames;
  flags: typeof languageFlags;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function detectBrowserLanguage(): Language {
  const browserLang = navigator.language.split('-')[0].toLowerCase();

  if (browserLang === 'fr') return 'fr';
  if (browserLang === 'es') return 'es';
  if (browserLang === 'de') return 'de';

  return 'en'; // Default to English
}

function getStoredLanguage(): Language | null {
  const stored = localStorage.getItem('shiftconvert-language');
  if (stored && ['fr', 'en', 'es', 'de'].includes(stored)) {
    return stored as Language;
  }
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    return getStoredLanguage() || detectBrowserLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('shiftconvert-language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        languages: languageNames,
        flags: languageFlags,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
