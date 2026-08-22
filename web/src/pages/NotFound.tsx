import { FileQuestion } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/Button';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="container-page py-20">
      <EmptyState
        icon={<FileQuestion size={26} />}
        title={t('errors.notFound')}
        description={t('errors.notFoundText')}
        action={<LinkButton to="/">{t('errors.backHome')}</LinkButton>}
      />
    </div>
  );
}
