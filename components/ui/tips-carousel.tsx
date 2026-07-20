'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

interface Tip {
  key: string;
  icon?: string;
}

const TIPS: Tip[] = [
  { key: 'tips.tryVoice' },
  { key: 'tips.buildProfile' },
  { key: 'tips.uploadDocs' },
  { key: 'tips.webSearch' },
  { key: 'tips.interactiveMode' },
  { key: 'tips.agentRoles' },
  { key: 'tips.shortcut' },
  { key: 'tips.learningPath' },
];

export function TipsCarousel({ className }: { className?: string }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > current ? 1 : -1);
      setCurrent(index);
    },
    [current],
  );

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % TIPS.length);
  }, []);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + TIPS.length) % TIPS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <button
        onClick={prev}
        className="shrink-0 size-6 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/50 transition-all cursor-pointer"
        aria-label={t('common.prev')}
      >
        <ChevronLeft className="size-3.5" />
      </button>

      <div className="relative flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <Lightbulb className="shrink-0 size-3.5 text-amber-500/60 dark:text-amber-400/60" />
        <AnimatePresence mode="wait" custom={direction}>
          <motion.p
            key={current}
            custom={direction}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="text-[12px] text-muted-foreground/60 leading-tight truncate"
          >
            {t(TIPS[current].key)}
          </motion.p>
        </AnimatePresence>
      </div>

      <button
        onClick={next}
        className="shrink-0 size-6 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/50 transition-all cursor-pointer"
        aria-label={t('common.next')}
      >
        <ChevronRight className="size-3.5" />
      </button>

      <div className="shrink-0 flex items-center gap-1">
        {TIPS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`size-1.5 rounded-full transition-all duration-300 cursor-pointer ${
              i === current ? 'bg-foreground/40 w-3' : 'bg-foreground/15 hover:bg-foreground/25'
            }`}
            aria-label={`Tip ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
