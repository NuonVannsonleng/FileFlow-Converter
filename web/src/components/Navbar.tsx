import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Globe, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { LANGUAGES } from '@/i18n';
import { usePreferences, type ThemeMode } from '@/store/usePreferences';
import { Button, LinkButton } from './ui/Button';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { Logo } from './Logo';

const CONVERTER_LINKS = [
  { to: '/convert/image', key: 'nav.image' },
  { to: '/convert/video', key: 'nav.video' },
  { to: '/convert/audio', key: 'nav.audio' },
  { to: '/convert/document', key: 'nav.document' },
] as const;

const THEMES: { mode: ThemeMode; icon: typeof Sun; key: 'settings.light' | 'settings.dark' | 'settings.system' }[] = [
  { mode: 'light', icon: Sun, key: 'settings.light' },
  { mode: 'dark', icon: Moon, key: 'settings.dark' },
  { mode: 'system', icon: Monitor, key: 'settings.system' },
];

export function Navbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const language = usePreferences((state) => state.language);
  const setLanguage = usePreferences((state) => state.setLanguage);

  // The bar starts flush with the hero and gains a border once the page moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const ActiveTheme = THEMES.find((entry) => entry.mode === theme)?.icon ?? Monitor;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'text-ink' : 'text-muted hover:text-ink',
    );

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled
          ? 'border-b border-line bg-canvas/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <nav className="container-page flex h-16 items-center gap-2" aria-label="Main">
        <Link to="/" className="mr-2 flex items-center gap-2.5 rounded-lg py-1">
          <Logo className="h-8 w-8" />
          <span className="text-[17px] font-semibold tracking-tight">{t('brand.name')}</span>
        </Link>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-0.5 lg:flex">
          <NavLink to="/" end className={navLinkClass}>
            {t('nav.home')}
          </NavLink>

          <Dropdown
            label={t('nav.converters')}
            align="left"
            trigger={({ open, toggle, id }) => (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls={id}
                aria-haspopup="menu"
                className={cn(
                  'flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  location.pathname.startsWith('/convert') ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {t('nav.converters')}
                <ChevronDown
                  size={14}
                  className={cn('transition-transform duration-200', open && 'rotate-180')}
                />
              </button>
            )}
          >
            {({ close }) => (
              <>
                <DropdownItem
                  to="/convert"
                  onClick={close}
                  active={location.pathname === '/convert'}
                >
                  {t('nav.converter')}
                </DropdownItem>
                <div className="my-1 h-px bg-line" />
                {CONVERTER_LINKS.map((link) => (
                  <DropdownItem
                    key={link.to}
                    to={link.to}
                    onClick={close}
                    active={location.pathname === link.to}
                  >
                    {t(link.key)}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>

          <NavLink to="/history" className={navLinkClass}>
            {t('nav.history')}
          </NavLink>
          <NavLink to="/pricing" className={navLinkClass}>
            {t('nav.pricing')}
          </NavLink>
          <NavLink to="/about" className={navLinkClass}>
            {t('nav.about')}
          </NavLink>
        </div>

        <div className="flex-1" />

        {/* Theme + language, always visible */}
        <Dropdown
          label={t('nav.theme')}
          trigger={({ open, toggle, id }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={id}
              aria-haspopup="menu"
              aria-label={t('a11y.themeToggle')}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              <ActiveTheme size={17} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              {THEMES.map(({ mode, icon: Icon, key }) => (
                <DropdownItem
                  key={mode}
                  active={theme === mode}
                  icon={<Icon size={15} />}
                  onClick={() => {
                    setTheme(mode);
                    close();
                  }}
                >
                  {t(key)}
                </DropdownItem>
              ))}
            </>
          )}
        </Dropdown>

        <Dropdown
          label={t('nav.language')}
          trigger={({ open, toggle, id }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={id}
              aria-haspopup="menu"
              aria-label={t('a11y.languageSelect')}
              className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-ink"
            >
              <Globe size={17} />
              <span className="hidden sm:inline">{language.toUpperCase()}</span>
            </button>
          )}
        >
          {({ close }) => (
            <>
              {LANGUAGES.map((entry) => (
                <DropdownItem
                  key={entry.code}
                  active={language === entry.code}
                  icon={
                    language === entry.code ? (
                      <Check size={15} />
                    ) : (
                      <span className="w-[15px]" aria-hidden="true" />
                    )
                  }
                  onClick={() => {
                    setLanguage(entry.code);
                    close();
                  }}
                >
                  {entry.label}
                </DropdownItem>
              ))}
            </>
          )}
        </Dropdown>

        <LinkButton to="/convert" size="sm" className="ml-1 hidden sm:inline-flex">
          {t('nav.startConverting')}
        </LinkButton>

        <Button
          variant="ghost"
          size="sm"
          className="ml-1 h-9 w-9 px-0 lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </Button>
      </nav>

      {/* Mobile menu: a full panel rather than a squeezed desktop bar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            className="overflow-hidden border-t border-line bg-canvas lg:hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="container-page space-y-1 py-4">
              <MobileLink to="/" label={t('nav.home')} />
              <MobileLink to="/convert" label={t('nav.converter')} />
              <div className="grid grid-cols-2 gap-1 pl-3">
                {CONVERTER_LINKS.map((link) => (
                  <MobileLink key={link.to} to={link.to} label={t(link.key)} small />
                ))}
              </div>
              <MobileLink to="/history" label={t('nav.history')} />
              <MobileLink to="/pricing" label={t('nav.pricing')} />
              <MobileLink to="/about" label={t('nav.about')} />
              <MobileLink to="/settings" label={t('nav.settings')} />

              <LinkButton to="/convert" size="lg" fullWidth className="mt-3">
                {t('nav.startConverting')}
              </LinkButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function MobileLink({ to, label, small }: { to: string; label: string; small?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'block rounded-lg px-3 font-medium transition-colors',
          small ? 'py-2 text-sm' : 'py-2.5 text-[15px]',
          isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-elevated hover:text-ink',
        )
      }
    >
      {label}
    </NavLink>
  );
}
