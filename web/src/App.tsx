import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useThemeEffect } from '@/hooks/useTheme';
import { useJobEvents } from '@/hooks/useJobEvents';
import { useTranslation } from '@/hooks/useTranslation';
import { useFormats } from '@/store/useFormats';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastViewport } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/Spinner';
import { HomePage } from '@/pages/Home';
import { ConverterPage } from '@/pages/Converter';

// Secondary routes are split out: the landing page and converter are the ones
// that need to be instant, and nothing else should sit in that bundle.
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })),
);
const HistoryPage = lazy(() => import('@/pages/History').then((m) => ({ default: m.HistoryPage })));
const AboutPage = lazy(() => import('@/pages/About').then((m) => ({ default: m.AboutPage })));
const PricingPage = lazy(() => import('@/pages/Pricing').then((m) => ({ default: m.PricingPage })));
const NotFoundPage = lazy(() =>
  import('@/pages/NotFound').then((m) => ({ default: m.NotFoundPage })),
);

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const loadFormats = useFormats((state) => state.load);

  useThemeEffect();
  useJobEvents();

  useEffect(() => {
    void loadFormats();
  }, [loadFormats]);

  // Route changes should start at the top, the way a real page load does.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable fixed left-4 top-4 z-50 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-lift"
      >
        {t('nav.skipToContent')}
      </a>

      <Navbar />

      <main id="main" className="flex-1">
        {/* Keyed by route so navigating away clears a crashed page. */}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <Routes location={location}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/convert" element={<ConverterPage />} />
                  <Route path="/convert/:category" element={<ConverterPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/converter" element={<Navigate to="/convert" replace />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <ToastViewport />
    </div>
  );
}

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="flex items-center gap-2.5 text-sm text-muted">
        <Spinner size={18} />
        {t('common.loading')}
      </span>
    </div>
  );
}
