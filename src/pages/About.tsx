import { Shield, Code, Lock, Github } from 'lucide-react';
import { useLanguage } from '../i18n';

export function About() {
  const { t } = useLanguage();

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('about.title')}</h1>

        <div className="prose prose-gray max-w-none">
          <section className="card mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('about.privacy.title')}</h2>
                <p className="text-gray-600">
                  {t('about.privacy.text')}
                </p>
              </div>
            </div>
          </section>

          <section className="card mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Code className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('about.technology.title')}</h2>
                <p className="text-gray-600">
                  {t('about.technology.text')}
                </p>
              </div>
            </div>
          </section>

          <section className="card mb-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('about.free.title')}</h2>
                <p className="text-gray-600">
                  {t('about.free.text')}
                </p>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Github className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('about.opensource.title')}</h2>
                <p className="text-gray-600">
                  {t('about.opensource.text')}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
