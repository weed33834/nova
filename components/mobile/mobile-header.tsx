'use client';

import { useState } from 'react';
import { ArrowLeft, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTheme } from '@/lib/hooks/use-theme';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SettingsDialog } from '@/components/settings';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { StageMode } from '@/lib/types/stage';

interface MobileHeaderProps {
  readonly currentSceneTitle: string;
  readonly mode?: StageMode;
  readonly canEdit?: boolean;
  readonly onToggleEditMode?: () => void;
}

/**
 * MobileHeader — compact 56px header for mobile classroom.
 *
 * Replaces the desktop 80px Header with a tighter layout:
 * - Left: back button (44px touch target)
 * - Center: scene title (truncated, flex-1)
 * - Right: settings + theme + language
 *
 * Safe area top inset is applied via CSS var from the parent container.
 */
export function MobileHeader({
  currentSceneTitle,
  mode: _mode,
  canEdit: _canEdit,
  onToggleEditMode: _onToggleEditMode,
}: MobileHeaderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header
      className={cn(
        'shrink-0 flex items-center justify-between gap-2 px-2',
        'h-14 min-h-[56px]',
        'bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl',
        'border-b border-gray-200/60 dark:border-gray-800/60',
        'pt-[var(--safe-area-top)]',
        'z-10',
      )}
    >
      {/* Left: back button — 44px touch target */}
      <button
        onClick={() => router.push('/')}
        className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 active:scale-95 transition-all no-select-touch"
        aria-label={t('generation.backToHome')}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Center: title */}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-1">
        <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500 leading-none mb-0.5">
          {t('stage.currentScene')}
        </span>
        <h1
          className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate w-full text-center leading-tight"
          suppressHydrationWarning
        >
          {currentSceneTitle || t('common.loading')}
        </h1>
      </div>

      {/* Right: controls — 44px touch targets each */}
      <div className="shrink-0 flex items-center gap-0.5">
        {/* Language */}
        <LanguageSwitcher />

        {/* Theme */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 active:scale-95 transition-all no-select-touch"
              aria-label={t('settings.theme')}
            >
              {theme === 'light' && <Sun className="w-5 h-5" />}
              {theme === 'dark' && <Moon className="w-5 h-5" />}
              {theme === 'system' && <Monitor className="w-5 h-5" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="min-w-[160px] rounded-xl py-1"
          >
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <DropdownMenuItem
                key={opt}
                onSelect={() => setTheme(opt)}
                className={cn(
                  'cursor-pointer gap-2.5 py-2 text-[13px]',
                  theme === opt &&
                    'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 font-medium',
                )}
              >
                {opt === 'light' && <Sun className="w-4 h-4" />}
                {opt === 'dark' && <Moon className="w-4 h-4" />}
                {opt === 'system' && <Monitor className="w-4 h-4" />}
                {t(`settings.themeOptions.${opt}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 active:scale-95 transition-all no-select-touch"
          aria-label={t('settings.title')}
        >
          <Settings className="w-5 h-5" />
        </button>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>
    </header>
  );
}
