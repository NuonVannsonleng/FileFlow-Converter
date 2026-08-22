import { History as HistoryIcon, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { HistoryList } from '@/components/HistoryList';
import { Button, LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useHistory } from '@/store/useHistory';
import { usePreferences } from '@/store/usePreferences';
import { toast } from '@/store/useToasts';

export function HistoryPage() {
  const { t } = useTranslation();
  const entries = useHistory((state) => state.entries);
  const clear = useHistory((state) => state.clear);
  const keepHistory = usePreferences((state) => state.keepHistory);

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mx-auto flex max-w-2xl flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('history.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t('history.subtitle')}</p>
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={15} />}
            onClick={() => {
              if (!window.confirm(t('settings.clearHistoryConfirm'))) return;
              clear();
              toast.success(t('toast.cleared'));
            }}
          >
            {t('history.deleteAll')}
          </Button>
        )}
      </header>

      <div className="mx-auto mt-8 max-w-2xl">
        {!keepHistory && entries.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={<HistoryIcon size={26} />}
              title={t('history.disabled')}
              description={t('history.disabledText')}
              action={<LinkButton to="/settings">{t('nav.settings')}</LinkButton>}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={<HistoryIcon size={26} />}
              title={t('history.empty')}
              description={t('history.emptyText')}
              action={<LinkButton to="/convert">{t('history.emptyAction')}</LinkButton>}
            />
          </div>
        ) : (
          <HistoryList entries={entries} />
        )}
      </div>
    </div>
  );
}
