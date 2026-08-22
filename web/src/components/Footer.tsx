import { Link } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { Logo } from './Logo';

export function Footer() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const groups = [
    {
      title: t('footer.product'),
      links: [
        { to: '/convert', label: t('nav.converter') },
        { to: '/convert/image', label: t('nav.image') },
        { to: '/convert/video', label: t('nav.video') },
        { to: '/convert/audio', label: t('nav.audio') },
        { to: '/convert/document', label: t('nav.document') },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { to: '/about', label: t('nav.about') },
        { to: '/pricing', label: t('nav.pricing') },
        { to: '/history', label: t('nav.history') },
        { to: '/settings', label: t('nav.settings') },
      ],
    },
  ];

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="text-[17px] font-semibold tracking-tight">{t('brand.name')}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              {t('footer.tagline')}
            </p>
            <p className="mt-4 max-w-xs text-xs leading-relaxed text-faint">
              {t('footer.builtWith')}
            </p>
          </div>

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {t('brand.full')}. {t('footer.rights')}
          </p>
          <p>{t('brand.tagline')}</p>
        </div>
      </div>
    </footer>
  );
}
