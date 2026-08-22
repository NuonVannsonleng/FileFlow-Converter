import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Download,
  FileCheck2,
  Layers,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { Category } from '@shared';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useConversion } from '@/store/useConversion';
import { useFormats } from '@/store/useFormats';
import { toast } from '@/store/useToasts';
import { messageForError } from '@/components/ConversionWorkspace';
import { ConverterCard } from '@/components/ConverterCard';
import { UploadDropzone } from '@/components/UploadDropzone';
import { LinkButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/** Shown on the landing page when the server reports these pairs as available. */
const POPULAR: { from: string; to: string; category: Category }[] = [
  { from: 'jpg', to: 'png', category: 'image' },
  { from: 'png', to: 'jpg', category: 'image' },
  { from: 'pdf', to: 'docx', category: 'document' },
  { from: 'docx', to: 'pdf', category: 'document' },
  { from: 'mp4', to: 'mp3', category: 'video' },
  { from: 'mp4', to: 'webm', category: 'video' },
];

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const data = useFormats((state) => state.data);
  const status = useFormats((state) => state.status);
  const addFiles = useConversion((state) => state.addFiles);
  const uploadProgress = useConversion((state) => state.uploadProgress);
  const phase = useConversion((state) => state.phase);

  const capabilities = data?.capabilities;
  const availableCount = useMemo(
    () => (data?.conversions ?? []).filter((option) => option.available).length,
    [data],
  );

  // Only advertise a popular converter the server can actually run.
  const popular = useMemo(
    () =>
      POPULAR.filter((entry) =>
        (data?.conversions ?? []).some(
          (option) => option.from === entry.from && option.to === entry.to && option.available,
        ),
      ),
    [data],
  );

  /** Uploading from the hero hands off straight into the converter. */
  const handleFiles = async (files: File[]) => {
    try {
      await addFiles(files);
      navigate('/convert');
    } catch (error) {
      toast.error(messageForError(error, t));
    }
  };

  return (
    <>
      <Hero
        onFiles={handleFiles}
        busy={phase === 'uploading'}
        progress={uploadProgress}
        maxSize={capabilities ? formatBytes(capabilities.maxFileSizeBytes, 0) : undefined}
        maxFiles={capabilities?.maxFilesPerBatch}
      />

      {/* Popular converters */}
      <section className="container-page mt-20 sm:mt-28" aria-labelledby="popular-heading">
        <SectionHeading id="popular-heading" title={t('popular.title')} subtitle={t('popular.subtitle')} />

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {status === 'loading' &&
            Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-[74px] rounded-xl" />
            ))}

          {popular.map((entry) => (
            <ConverterCard key={`${entry.from}-${entry.to}`} {...entry} />
          ))}
        </div>

        <div className="mt-6 text-center">
          <LinkButton to="/convert" variant="ghost" size="sm" iconRight={<Sparkles size={14} />}>
            {t('popular.viewAll')}
          </LinkButton>
        </div>
      </section>

      {/* Why FileFlow */}
      <section className="container-page mt-20 sm:mt-28" aria-labelledby="why-heading">
        <SectionHeading id="why-heading" title={t('why.title')} subtitle={t('why.subtitle')} />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<Zap size={20} />} title={t('why.fast')} body={t('why.fastText')} />
          <Feature
            icon={<ShieldCheck size={20} />}
            title={t('why.secure')}
            body={t('why.secureText', { minutes: capabilities?.fileTtlMinutes ?? 60 })}
          />
          <Feature
            icon={<MousePointerClick size={20} />}
            title={t('why.easy')}
            body={t('why.easyText')}
          />
          <Feature
            icon={<Layers size={20} />}
            title={t('why.multi')}
            body={t('why.multiText', { count: availableCount || 180 })}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="container-page mt-20 sm:mt-28" aria-labelledby="steps-heading">
        <SectionHeading id="steps-heading" title={t('steps.title')} subtitle={t('steps.subtitle')} />

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <MousePointerClick size={18} />, title: t('steps.upload'), body: t('steps.uploadText') },
            { icon: <Layers size={18} />, title: t('steps.choose'), body: t('steps.chooseText') },
            { icon: <Sparkles size={18} />, title: t('steps.convert'), body: t('steps.convertText') },
            { icon: <Download size={18} />, title: t('steps.download'), body: t('steps.downloadText') },
          ].map((step, index) => (
            <li key={step.title} className="relative rounded-card border border-line bg-surface p-5">
              <span className="absolute right-4 top-4 text-3xl font-bold tabular-nums text-line">
                {index + 1}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                {step.icon}
              </span>
              <h3 className="mt-3.5 text-base font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section className="container-page mt-20 sm:mt-28" aria-labelledby="faq-heading">
        <SectionHeading id="faq-heading" title={t('faq.title')} subtitle={t('faq.subtitle')} />

        <div className="mx-auto mt-8 max-w-2xl divide-y divide-line rounded-card border border-line bg-surface">
          {(
            [
              ['faq.q1', 'faq.a1'],
              ['faq.q2', 'faq.a2'],
              ['faq.q3', 'faq.a3'],
              ['faq.q4', 'faq.a4'],
              ['faq.q5', 'faq.a5'],
              ['faq.q6', 'faq.a6'],
            ] as const
          ).map(([question, answer]) => (
            <FaqItem
              key={question}
              question={t(question)}
              answer={t(answer, {
                size: capabilities ? formatBytes(capabilities.maxFileSizeBytes, 0) : '200 MB',
                count: capabilities?.maxFilesPerBatch ?? 20,
                minutes: capabilities?.fileTtlMinutes ?? 60,
              })}
            />
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="container-page mt-20 sm:mt-28">
        <div className="relative overflow-hidden rounded-card border border-line bg-surface px-6 py-14 text-center">
          <div
            className="pointer-events-none absolute inset-0 grid-noise opacity-40 mask-radial"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 className="text-2xl font-semibold text-balance sm:text-3xl">{t('hero.title')}</h2>
            <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-muted">
              {t('hero.subtitle')}
            </p>
            <LinkButton to="/convert" size="lg" className="mt-7">
              {t('nav.startConverting')}
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  );
}

function Hero({
  onFiles,
  busy,
  progress,
  maxSize,
  maxFiles,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  progress: number;
  maxSize?: string;
  maxFiles?: number;
}) {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden pb-4 pt-10 sm:pt-16">
      {/* Subtle animated background: two drifting blooms behind a faint grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 grid-noise opacity-[0.55] mask-radial" />
        <motion.div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl"
          animate={{ y: [0, -24, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-20 top-16 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl"
          animate={{ y: [0, 28, 0], scale: [1.04, 1, 1.04] }}
          transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="container-page">
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <FileCheck2 size={13} className="text-accent" aria-hidden="true" />
            {t('hero.badge')}
          </span>

          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {t('hero.subtitle')}
          </p>
        </motion.div>

        <motion.div
          className="mx-auto mt-9 max-w-2xl"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <UploadDropzone onFiles={onFiles} busy={busy} progress={progress} />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-faint">
            <span>{t('hero.formatsLine')}</span>
            {maxSize && (
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
                {t('hero.maxSize', { size: maxSize })}
              </span>
            )}
            {maxFiles && (
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
                {t('hero.multiple', { count: maxFiles })}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-line" aria-hidden="true" />
              {t('hero.noAccount')}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-lift motion-reduce:transform-none">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="flex-1 text-sm font-medium">{question}</span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 text-faint transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-300 ease-smooth',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{answer}</p>
        </div>
      </div>
    </div>
  );
}
