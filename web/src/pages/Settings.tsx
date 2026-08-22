import { Check, Globe, Monitor, Moon, RotateCcw, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { LANGUAGES } from '@/i18n';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useFormats } from '@/store/useFormats';
import { useHistory } from '@/store/useHistory';
import { usePreferences, type ThemeMode } from '@/store/usePreferences';
import { toast } from '@/store/useToasts';
import { Button } from '@/components/ui/Button';
import { Field, selectClass } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';

const THEME_OPTIONS: { mode: ThemeMode; icon: typeof Sun; key: 'settings.light' | 'settings.dark' | 'settings.system' }[] = [
  { mode: 'light', icon: Sun, key: 'settings.light' },
  { mode: 'dark', icon: Moon, key: 'settings.dark' },
  { mode: 'system', icon: Monitor, key: 'settings.system' },
];

export function SettingsPage() {
  const { t } = useTranslation();

  const preferences = usePreferences();
  const data = useFormats((state) => state.data);
  const clearHistory = useHistory((state) => state.clear);
  const historyCount = useHistory((state) => state.entries.length);

  const capabilities = data?.capabilities;
  const ttl = capabilities?.fileTtlMinutes ?? 60;

  // Only formats that are a target of at least one working conversion.
  const defaultFormatOptions = [
    ...new Set((data?.conversions ?? []).filter((c) => c.available).map((c) => c.to)),
  ].sort();

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('settings.subtitle')}</p>
      </header>

      <div className="mx-auto mt-9 max-w-2xl space-y-6">
        {/* Appearance */}
        <Section title={t('settings.appearance')} hint={t('settings.appearanceHint')}>
          <div
            role="radiogroup"
            aria-label={t('settings.appearance')}
            className="grid grid-cols-3 gap-2.5"
          >
            {THEME_OPTIONS.map(({ mode, icon: Icon, key }) => {
              const active = preferences.theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => preferences.setTheme(mode)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition-all duration-200',
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
                  )}
                >
                  <Icon size={18} />
                  {t(key)}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Language */}
        <Section title={t('settings.language')} hint={t('settings.languageHint')}>
          <div role="radiogroup" aria-label={t('settings.language')} className="space-y-2">
            {LANGUAGES.map((language) => {
              const active = preferences.language === language.code;
              return (
                <button
                  key={language.code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => preferences.setLanguage(language.code)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200',
                    active
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-surface hover:border-accent/40',
                  )}
                >
                  <Globe size={17} className={active ? 'text-accent' : 'text-faint'} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{language.label}</span>
                    <span className="block text-xs text-muted">{language.english}</span>
                  </span>
                  {active && <Check size={16} className="text-accent" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Conversion */}
        <Section title={t('settings.conversion')}>
          <Field label={t('settings.defaultFormat')} hint={t('settings.defaultFormatHint')}>
            {({ id }) => (
              <select
                id={id}
                className={selectClass}
                value={preferences.defaultFormat ?? ''}
                onChange={(event) =>
                  preferences.setDefaultFormat(event.target.value || null)
                }
              >
                <option value="">{t('settings.defaultFormatNone')}</option>
                {defaultFormatOptions.map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div className="mt-1 divide-y divide-line">
            <Switch
              label={t('settings.autoDownload')}
              hint={t('settings.autoDownloadHint')}
              checked={preferences.autoDownload}
              onChange={preferences.setAutoDownload}
            />
            <Switch
              label={t('settings.keepHistory')}
              hint={t('settings.keepHistoryHint')}
              checked={preferences.keepHistory}
              onChange={preferences.setKeepHistory}
            />
            <Switch
              label={t('settings.autoCleanup')}
              hint={t('settings.autoCleanupHint', { minutes: ttl })}
              checked
              disabled
              onChange={() => {
                /* Server-enforced; the control is informational. */
              }}
            />
          </div>
        </Section>

        {/* Privacy */}
        <Section title={t('settings.privacy')}>
          <div className="flex gap-3 rounded-xl bg-accent-soft/60 p-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted">
              {t('settings.privacyBody', { minutes: ttl })}
            </p>
          </div>
        </Section>

        {/* Engines */}
        {capabilities && (
          <Section title={t('settings.engines')} hint={t('settings.enginesHint')}>
            <ul className="divide-y divide-line">
              {Object.entries(capabilities.engines).map(([name, engine]) => (
                <li key={name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      engine.available ? 'bg-success' : 'bg-line',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium capitalize">{name}</span>
                    {engine.detail && (
                      <span className="block truncate text-xs text-muted">{engine.detail}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs font-medium',
                      engine.available ? 'text-success' : 'text-faint',
                    )}
                  >
                    {engine.available
                      ? t('settings.engineAvailable')
                      : t('settings.engineUnavailable')}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
              <Stat label={t('hero.maxSize', { size: '' }).trim()} value={formatBytes(capabilities.maxFileSizeBytes, 0)} />
              <Stat label={t('nav.converter')} value={String(capabilities.maxFilesPerBatch)} />
              <Stat label={t('success.time')} value={`${ttl} min`} />
            </dl>
          </Section>
        )}

        {/* Danger zone */}
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="outline"
            icon={<Trash2 size={16} />}
            disabled={historyCount === 0}
            onClick={() => {
              if (!window.confirm(t('settings.clearHistoryConfirm'))) return;
              clearHistory();
              toast.success(t('toast.cleared'));
            }}
          >
            {t('settings.clearHistory')}
          </Button>
          <Button
            variant="ghost"
            icon={<RotateCcw size={16} />}
            onClick={() => {
              preferences.reset();
              toast.success(t('settings.saved'));
            }}
          >
            {t('settings.reset')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
