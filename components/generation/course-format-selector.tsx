'use client';

import { useState, useRef, useEffect, type ComponentPropsWithoutRef } from 'react';
import { Video, Presentation, FileText, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { CourseFormat } from '@/lib/types/generation';

type DataAttributes = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

type CourseFormatSelectorProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'aria-expanded' | 'children' | 'onChange'
> &
  DataAttributes & {
    value: CourseFormat;
    onChange: (value: CourseFormat) => void;
  };

interface FormatOption {
  value: CourseFormat;
  labelKey: string;
  descKey: string;
  icon: typeof Video;
}

const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'video', labelKey: 'toolbar.courseFormatVideo', descKey: 'toolbar.courseFormatVideoDesc', icon: Video },
  { value: 'ppt-audio', labelKey: 'toolbar.courseFormatPptAudio', descKey: 'toolbar.courseFormatPptAudioDesc', icon: Presentation },
  { value: 'text-only', labelKey: 'toolbar.courseFormatTextOnly', descKey: 'toolbar.courseFormatTextOnlyDesc', icon: FileText },
];

export function CourseFormatSelector({
  value,
  onChange,
  className,
  onClick,
  ...buttonProps
}: CourseFormatSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const currentOption = FORMAT_OPTIONS.find((o) => o.value === value) ?? FORMAT_OPTIONS[0];
  const CurrentIcon = currentOption.icon;

  return (
    <div className="relative">
      <button
        {...buttonProps}
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('toolbar.courseFormatLabel')}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) setOpen((prev) => !prev);
        }}
        className={cn(
          'relative inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 motion-reduce:transition-none motion-reduce:active:scale-100 dark:focus-visible:outline-violet-300',
          'border-violet-600 bg-transparent text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950/50',
          className,
        )}
      >
        <CurrentIcon aria-hidden="true" className="relative z-10 size-3.5" />
        <span className="relative z-10 hidden sm:inline">{t(currentOption.labelKey)}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('relative z-10 size-3 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={t('toolbar.courseFormatLabel')}
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg shadow-gray-300/40 dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40"
        >
          {FORMAT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  isSelected
                    ? 'bg-violet-50 dark:bg-violet-950/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    isSelected
                      ? 'text-violet-600 dark:text-violet-400'
                      : 'text-gray-400 dark:text-gray-500',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      'text-xs font-semibold',
                      isSelected
                        ? 'text-violet-900 dark:text-violet-200'
                        : 'text-gray-700 dark:text-gray-200',
                    )}
                  >
                    {t(option.labelKey)}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                    {t(option.descKey)}
                  </div>
                </div>
                {isSelected && (
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
