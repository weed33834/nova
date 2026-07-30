'use client';

import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useRouter } from 'next/navigation';
import type { StageMode } from '@/lib/types/stage';
import { HeaderControls } from './stage/header-controls';
import { cn } from '@/lib/utils';

interface HeaderProps {
  readonly currentSceneTitle: string;
  readonly mode?: StageMode;
  readonly canEdit?: boolean;
  readonly onToggleEditMode?: () => void;
}

export function Header({ currentSceneTitle, mode, canEdit, onToggleEditMode }: HeaderProps) {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <>
      <header
        className={cn(
          // Mobile: compact 56px header with safe-area inset for notched devices.
          // Desktop keeps the 80px spacious feel from the original design.
          'flex items-center justify-between z-10 bg-transparent gap-3 sm:gap-4',
          'h-14 sm:h-20 px-3 sm:px-8',
          'pt-[var(--safe-area-top)]',
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={() => router.push('/')}
            className={cn(
              // 44px touch target on mobile (WCAG 2.5.5), 36px on desktop.
              'shrink-0 flex items-center justify-center rounded-lg transition-colors',
              'h-11 w-11 sm:h-9 sm:w-9',
              'text-gray-400 dark:text-gray-500',
              'hover:bg-gray-100 dark:hover:bg-gray-800',
              'hover:text-gray-700 dark:hover:text-gray-300',
              'active:scale-95',
            )}
            aria-label={t('generation.backToHome')}
            title={t('generation.backToHome')}
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          {/* Title block — hidden when `mode === 'edit'`. Header lives
              inside `PlaybackChromeRoot`, which is unmounted by `Stage`
              once mode flips to 'edit', so in steady state this branch
              is always taken. The guard exists for the ~280ms
              AnimatePresence exit window where the playback chrome
              is still rendering its exit animation while `mode` has
              already flipped — without the guard, this title would
              briefly stack on top of the incoming EditChromeRoot's
              CommandBar title during the cross-fade. */}
          {mode !== 'edit' && (
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500 mb-0.5 hidden sm:block">
                {t('stage.currentScene')}
              </span>
              <h1
                className="text-base sm:text-xl font-bold text-gray-800 dark:text-gray-200 tracking-tight truncate"
                suppressHydrationWarning
              >
                {currentSceneTitle || t('common.loading')}
              </h1>
            </div>
          )}
        </div>

        <HeaderControls mode={mode} canEdit={canEdit} onToggleEditMode={onToggleEditMode} />
      </header>
    </>
  );
}
