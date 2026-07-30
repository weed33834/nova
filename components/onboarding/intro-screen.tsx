'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Sparkles,
  ArrowRight,
  Zap,
  Palette,
  BookOpen,
  Users,
  GraduationCap,
  FileText,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useOnboardingStore } from '@/lib/store/onboarding';
import { EASE_OUT, DURATION_NORMAL, DURATION_SLOW, SPRING_GENTLE } from '@/lib/ui/motion-presets';

/**
 * IntroScreen — full-screen onboarding splash shown on first launch.
 *
 * Three phases, all rendered in a single overlay:
 *  1. **Welcome**: Logo + title + subtitle + "Start" button.
 *  2. **Showcase**: Auto-playing feature carousel introducing what Nova does,
 *     followed by a grid of "starter prompts" (希望语) the student can click
 *     to jump straight into the main interface with the prompt pre-filled.
 *  3. **Exit**: Fade + scale out, revealing the main page beneath.
 *
 * State is persisted via the onboarding store (`hasSeenIntro`) so the splash
 * only appears once per user (unless they reset onboarding).
 */

type Phase = 'welcome' | 'showcase' | 'exiting';

const FEATURES = [
  {
    icon: Zap,
    titleKey: 'intro.feature1Title',
    descKey: 'intro.feature1Desc',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    glow: 'shadow-amber-500/20',
  },
  {
    icon: Palette,
    titleKey: 'intro.feature2Title',
    descKey: 'intro.feature2Desc',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    glow: 'shadow-pink-500/20',
  },
  {
    icon: BookOpen,
    titleKey: 'intro.feature3Title',
    descKey: 'intro.feature3Desc',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    glow: 'shadow-blue-500/20',
  },
  {
    icon: Users,
    titleKey: 'intro.feature4Title',
    descKey: 'intro.feature4Desc',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    glow: 'shadow-emerald-500/20',
  },
];

// Starter prompt keys — each resolves to a localized example prompt that
// students can click to pre-fill the main input. The index matches the
// i18n key: intro.prompt1 ... intro.prompt4.
const STARTER_PROMPT_KEYS = [
  'intro.prompt1',
  'intro.prompt2',
  'intro.prompt3',
  'intro.prompt4',
] as const;

const PROMPT_ICONS = [GraduationCap, FileText, Lightbulb, BookOpen];

// Shared spring for logo entrance, matching the existing hero logo feel.
const LOGO_SPRING = SPRING_GENTLE;

export interface IntroScreenProps {
  /** Called when the user finishes the intro. If a prompt was selected, its
   * localized text is passed so the parent can pre-fill the input. */
  onComplete: (selectedPrompt?: string) => void;
}

export function IntroScreen({ onComplete }: IntroScreenProps) {
  const { t } = useI18n();
  const setHasSeenIntro = useOnboardingStore((s) => s.setHasSeenIntro);
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('welcome');
  const [activeFeature, setActiveFeature] = useState(0);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);

  // When reduced motion is preferred, skip auto-advance and show all features at once.
  const showcaseDelay = prefersReducedMotion ? 0 : 1800;

  // Auto-advance the feature carousel during the showcase phase.
  useEffect(() => {
    if (phase !== 'showcase') return;
    if (activeFeature >= FEATURES.length - 1) return;
    if (showcaseDelay === 0) return; // reduced motion: don't auto-advance
    const timer = setTimeout(() => setActiveFeature((i) => i + 1), showcaseDelay);
    return () => clearTimeout(timer);
  }, [phase, activeFeature, showcaseDelay]);

  const handleStart = useCallback(() => {
    setPhase('showcase');
  }, []);

  const finish = useCallback(
    (prompt?: string) => {
      setSelectedPrompt(prompt ?? null);
      setHasSeenIntro(true);
      setPhase('exiting');
      // Wait for exit animation, then notify parent.
      setTimeout(() => onComplete(prompt), 700);
    },
    [onComplete, setHasSeenIntro],
  );

  const handleEnterMain = useCallback(() => finish(), [finish]);

  const handlePromptClick = useCallback(
    (promptKey: string) => {
      const promptText = t(promptKey);
      finish(promptText);
    },
    [finish, t],
  );

  return (
    <>
      <AnimatePresence>
        {phase !== 'exiting' && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
            transition={{ duration: DURATION_SLOW, ease: EASE_OUT }}
          >
          {/* Background — layered gradients matching Nova's pink/amber theme */}
          <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-white to-amber-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
          <motion.div
            className="absolute -top-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full bg-rose-300/20 dark:bg-rose-600/10 blur-[120px]"
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-1/4 -right-1/4 w-[55vw] h-[55vw] rounded-full bg-amber-300/20 dark:bg-amber-600/10 blur-[120px]"
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.6, 0.4, 0.6] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Content */}
          <div className="relative z-10 w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
            <AnimatePresence mode="wait">
              {/* ── Phase 1: Welcome ── */}
              {phase === 'welcome' && (
                <motion.div
                  className="flex flex-col items-center text-center space-y-6 sm:space-y-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -30, transition: { duration: 0.4 } }}
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={LOGO_SPRING}
                    className="relative"
                  >
                    <div className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-amber-500 shadow-xl shadow-rose-500/30">
                      <Sparkles className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
                    </div>
                    <motion.div
                      className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-400 to-amber-400 blur-xl opacity-50"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: DURATION_SLOW, ease: EASE_OUT }}
                    className="space-y-2 sm:space-y-3"
                  >
                    <h1 className="text-4xl sm:text-5xl sm:text-6xl font-bold bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 bg-clip-text text-transparent">
                      {t('intro.title', { defaultValue: 'Nova' })}
                    </h1>
                    <p className="text-base sm:text-lg sm:text-xl text-muted-foreground max-w-xl px-2 sm:px-0">
                      {t('intro.subtitle', {
                        defaultValue: 'AI-Powered Interactive Classroom Generator',
                      })}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                  >
                    <Button
                      size="lg"
                      onClick={handleStart}
                      className="gap-2 text-sm sm:text-base px-6 py-4 sm:px-8 sm:py-6 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 shadow-lg shadow-rose-500/25 transition-all hover:shadow-xl hover:shadow-rose-500/30 hover:scale-105"
                    >
                      {t('intro.startButton', { defaultValue: 'Get Started' })}
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                    className="text-xs text-muted-foreground/60"
                  >
                    {t('intro.welcomeHint', {
                      defaultValue: 'Click to explore what Nova can do for you',
                    })}
                  </motion.p>
                </motion.div>
              )}

              {/* ── Phase 2: Showcase + Starter Prompts ── */}
              {phase === 'showcase' && (
                <motion.div
                  key="showcase"
                  className="space-y-6 sm:space-y-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.3 } }}
                >
                  {/* Header */}
                  <div className="text-center space-y-1.5 sm:space-y-2">
                    <motion.h2
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xl sm:text-2xl sm:text-3xl font-bold"
                    >
                      {t('intro.showcaseTitle', {
                        defaultValue: 'What can Nova do?',
                      })}
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: 0.2 } }}
                      className="text-xs sm:text-sm text-muted-foreground px-2 sm:px-0"
                    >
                      {t('intro.showcaseDesc', {
                        defaultValue:
                          'Transform any material into an engaging, interactive learning experience',
                      })}
                    </motion.p>
                  </div>

                  {/* Feature carousel — auto-advancing, with progress dots */}
                  <div className="relative h-36 sm:h-40">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeFeature}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -40 }}
                        transition={{ duration: DURATION_NORMAL, ease: EASE_OUT }}
                        className="absolute inset-0 flex items-center justify-center px-2 sm:px-0"
                      >
                        <FeatureCard feature={FEATURES[activeFeature]} t={t} />
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Progress dots */}
                  <div className="flex items-center justify-center gap-2">
                    {FEATURES.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveFeature(i)}
                        className={cn(
                          'h-2 rounded-full transition-all',
                          i === activeFeature
                            ? 'w-8 bg-gradient-to-r from-rose-500 to-amber-500'
                            : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50',
                        )}
                        aria-label={`Feature ${i + 1}`}
                      />
                    ))}
                  </div>

                  {/* Starter prompts — 希望语 */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="space-y-3"
                  >
                    <p className="text-center text-sm font-medium text-muted-foreground">
                      {t('intro.promptsTitle', {
                        defaultValue: 'Try one of these to get started',
                      })}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-2.5 sm:gap-3">
                      {STARTER_PROMPT_KEYS.map((promptKey, i) => {
                        const Icon = PROMPT_ICONS[i] ?? Lightbulb;
                        return (
                          <motion.button
                            key={promptKey}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.4 + i * 0.08, duration: 0.3 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handlePromptClick(promptKey)}
                            className="group flex items-start gap-2.5 sm:gap-3 rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3 sm:p-4 text-left transition-colors hover:border-rose-300/50 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
                          >
                            <div className="mt-0.5 flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500/10 to-amber-500/10 text-rose-600 dark:text-rose-400">
                              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </div>
                            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80 group-hover:text-foreground">
                              {t(promptKey)}
                            </p>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Enter main button */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.4 }}
                    className="flex justify-center pt-2"
                  >
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={handleEnterMain}
                      className="gap-2 text-muted-foreground hover:text-foreground"
                    >
                      {t('intro.enterMain', { defaultValue: 'Enter Nova' })}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Exit overlay checkmark — shown briefly when a prompt was selected */}
    {phase === 'exiting' && selectedPrompt && (
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed inset-0 z-[301] flex items-center justify-center pointer-events-none"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 backdrop-blur-sm">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>
      </motion.div>
    )}
    </>
  );
}

function FeatureCard({
  feature,
  t,
}: {
  feature: (typeof FEATURES)[number];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const Icon = feature.icon;
  return (
    <div
      className={cn(
        'flex items-center gap-3 sm:gap-4 rounded-2xl border border-border/40 p-3 sm:p-5 backdrop-blur-md shadow-lg w-full max-w-md',
        feature.glow,
        feature.bg,
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-card/80',
          feature.color,
        )}
      >
        <Icon className="h-5 w-5 sm:h-7 sm:w-7" />
      </div>
      <div className="text-left space-y-0.5 sm:space-y-1 min-w-0">
        <h3 className="font-semibold text-sm sm:text-base">{t(feature.titleKey)}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{t(feature.descKey)}</p>
      </div>
    </div>
  );
}
