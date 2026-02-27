import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { Convert } from './pages/Convert';
import { ConvertFonts } from './pages/ConvertFonts';
import { Utilities } from './pages/Utilities';
import { Utility } from './pages/Utility';
import { About } from './pages/About';
import { LanguageProvider } from './i18n';

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
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
