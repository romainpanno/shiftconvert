import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { Convert } from './pages/Convert';
import { ConvertFonts } from './pages/ConvertFonts';
import { Utilities } from './pages/Utilities';
import { Utility } from './pages/Utility';
import { About } from './pages/About';
import { LanguageProvider } from './i18n';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Analytics />
        <SpeedInsights />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="convert/fonts" element={<ConvertFonts />} />
            <Route path="convert/:category" element={<Convert />} />
            <Route path="utilities" element={<Utilities />} />
            <Route path="utility/:utilityId" element={<Utility />} />
            <Route path="about" element={<About />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
