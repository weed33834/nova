'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  HelpCircle,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TourStep } from '@/lib/tour/steps';

interface SpotlightProps {
  step: TourStep;
  isVisible: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  currentStep: number;
  totalSteps: number;
}

function getTargetRect(selector: string): DOMRect | null {
  if (typeof window === 'undefined') return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function getTooltipPosition(
  rect: DOMRect,
  position: SpotlightProps['step']['position'] = 'bottom',
  sideOffset = 12,
  alignOffset = 0,
): { top: number; left: number; transformOrigin: string } {
  const tooltipWidth = 320;
  const tooltipHeight = 160;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top = 0;
  let left = 0;
  let transformOrigin = 'top center';

  switch (position) {
    case 'top':
      top = rect.top - tooltipHeight - sideOffset;
      left = rect.left + rect.width / 2 - tooltipWidth / 2 + alignOffset;
      transformOrigin = 'bottom center';
      break;
    case 'bottom':
      top = rect.bottom + sideOffset;
      left = rect.left + rect.width / 2 - tooltipWidth / 2 + alignOffset;
      transformOrigin = 'top center';
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - sideOffset;
      transformOrigin = 'right center';
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.right + sideOffset;
      transformOrigin = 'left center';
      break;
    case 'center':
    default:
      top = viewportHeight / 2 - tooltipHeight / 2;
      left = viewportWidth / 2 - tooltipWidth / 2;
      transformOrigin = 'center';
      break;
  }

  // Clamp to viewport
  left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16));
  top = Math.max(16, Math.min(top, viewportHeight - tooltipHeight - 16));

  return { top, left, transformOrigin };
}

export function TourSpotlight({
  step,
  isVisible,
  onClose,
  onNext,
  onPrev,
  currentStep,
  totalSteps,
}: SpotlightProps) {
  const { t } = useI18n();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!isVisible) return;

    const updateRect = () => {
      const target = document.querySelector(step.targetSelector);
      if (target) {
        targetRef.current = target;
        setRect(target.getBoundingClientRect());
        // Scroll target into view if needed
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else {
        setRect(null);
      }
    };

    updateRect();
    const observer = new MutationObserver(updateRect);
    if (targetRef.current) {
      observer.observe(targetRef.current, { attributes: true, childList: true, subtree: true });
    }
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    return () => {
      observer.disconnect();
      setRect(null);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [isVisible, step.targetSelector]);

  const position = getTooltipPosition(
    rect || {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => '',
    },
    step.position,
    step.sideOffset,
    step.alignOffset,
  );

  const isLastStep = currentStep === totalSteps - 1;
  const showOverlay = step.position !== 'center';

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <>
          {showOverlay && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={onClose}
              aria-hidden="true"
              style={{ pointerEvents: 'auto' }}
            >
              {rect && (
                <motion.div
                  className="absolute bg-white dark:bg-slate-800 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] ring-2 ring-blue-500/50 pointer-events-none"
                  style={{
                    top: rect.top - 8,
                    left: rect.left - 8,
                    width: rect.width + 16,
                    height: rect.height + 16,
                  }}
                  animate={{
                    boxShadow: [
                      '0 0 0 9999px rgba(0,0,0,0.4)',
                      '0 0 0 9999px rgba(0,0,0,0.4)',
                      '0 0 0 9999px rgba(0,0,0,0.4)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>
          )}

          <motion.div
            key="tooltip"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed z-60 pointer-events-auto"
            style={{
              top: position.top,
              left: position.left,
              transformOrigin: position.transformOrigin,
              width: 320,
            }}
            role="dialog"
            aria-label={t(step.title)}
            aria-describedby="tour-description"
          >
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 p-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-amber-500">
                    <span className="text-white text-xs font-bold">{currentStep + 1}</span>
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                    {t(step.title)}
                  </h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  aria-label={t('tour.close')}
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Description */}
              <div id="tour-description" className="px-4 pb-3">
                <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                  {t(step.description)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono tabular-nums">
                    {currentStep + 1} / {totalSteps}
                  </span>
                  <span className="hidden sm:inline">·</span>
                  <span className="w-24 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-pink-500 to-amber-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    />
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {currentStep > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onPrev}
                      className="gap-1"
                      aria-label={t('tour.previous')}
                    >
                      <ChevronLeft className="size-3.5" />
                      <span className="hidden sm:inline">{t('tour.previous')}</span>
                    </Button>
                  )}

                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={onNext}
                    aria-label={
                      isLastStep ? t('tour.finish') : t('tour.next')
                    }
                  >
                    {isLastStep ? (
                      <>
                        <Check className="size-3.5" />
                        <span>{t('tour.finish')}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('tour.next')}</span>
                        <ChevronRight className="size-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Arrow pointing to target */}
            {step.position !== 'center' && rect && (
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-6 border-r-6 border-transparent"
                style={{
                  top: step.position === 'top' ? 'auto' : '100%',
                  bottom: step.position === 'top' ? '100%' : 'auto',
                  borderBottomColor: step.position === 'top' ? 'white' : 'transparent',
                  borderTopColor:
                    step.position === 'bottom'
                      ? typeof window !== 'undefined' &&
                        document.documentElement.classList.contains('dark')
                        ? '#1e293b'
                        : 'white'
                      : 'transparent',
                }}
                animate={{ opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function TourControls({
  isActive,
  currentStep,
  totalSteps,
  onStart,
  onClose,
}: {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  onStart: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  if (isActive) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-2 px-3"
      >
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          {currentStep + 1} / {totalSteps}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-slate-500 hover:text-red-500"
          aria-label={t('tour.endTour')}
        >
          <X className="size-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-1.5 h-9 px-3"
          aria-label={t('tour.showHelp')}
        >
          <HelpCircle className="size-4" />
          <span className="hidden sm:inline">{t('tour.help')}</span>
          {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={8}>
        <div className="space-y-2 p-2 min-w-[200px]">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={onStart}>
            <Sparkles className="size-4" />
            <span>{t('tour.startTour')}</span>
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400 px-2">
            {t('tour.helpDesc')}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
