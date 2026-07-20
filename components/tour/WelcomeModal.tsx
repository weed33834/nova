'use client';

import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, ArrowRight, Zap, Palette, BookOpen, Users, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOnboardingStore } from '@/lib/store/onboarding';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
}

const FEATURES = [
  {
    icon: Zap,
    title: 'tour.feature1Title',
    desc: 'tour.feature1Desc',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 dark:bg-amber-500/10',
  },
  {
    icon: Palette,
    title: 'tour.feature2Title',
    desc: 'tour.feature2Desc',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10 dark:bg-pink-500/10',
  },
  {
    icon: BookOpen,
    title: 'tour.feature3Title',
    desc: 'tour.feature3Desc',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 dark:bg-blue-500/10',
  },
  {
    icon: Users,
    title: 'tour.feature4Title',
    desc: 'tour.feature4Desc',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/10',
  },
];

export function WelcomeModal({ isOpen, onClose, onStartTour }: WelcomeModalProps) {
  const { t } = useI18n();
  const hasSeenWelcome = useOnboardingStore((s) => s.hasSeenWelcome);
  const setHasSeenWelcome = useOnboardingStore((s) => s.setHasSeenWelcome);

  const handleClose = () => {
    setHasSeenWelcome(true);
    onClose();
  };

  const handleStartTour = () => {
    setHasSeenWelcome(true);
    onStartTour();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
          >
            <Card
              className={cn(
                'w-full max-w-2xl overflow-hidden relative',
                'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl',
                'border border-slate-200/50 dark:border-slate-800/50',
                'shadow-2xl',
              )}
            >
              {/* Decorative top bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-amber-500 to-blue-500" />

              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                onClick={handleClose}
                aria-label={t('tour.close')}
              >
                <X className="size-5" />
              </Button>

              <div className="p-6 md:p-8 pt-10">
                {/* Header */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 to-amber-500 mb-4"
                  >
                    <Sparkles className="size-8 text-white" />
                  </motion.div>

                  <motion.h1
                    id="welcome-title"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100"
                  >
                    {t('tour.welcomeTitle')}
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 text-slate-600 dark:text-slate-300 text-lg"
                  >
                    {t('tour.welcomeDesc')}
                  </motion.p>
                </div>

                {/* Features */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="grid grid-cols-2 gap-4 mb-8"
                >
                  {FEATURES.map((feature, i) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className={cn(
                        'p-4 rounded-xl border transition-all hover:shadow-lg',
                        feature.bg,
                        'border-slate-200/50 dark:border-slate-700/50',
                      )}
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
                          feature.bg,
                        )}
                      >
                        <feature.icon className={cn('size-5', feature.color)} />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
                        {t(feature.title)}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t(feature.desc)}
                      </p>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="space-y-3"
                >
                  <Button
                    size="lg"
                    className="w-full gap-2 justify-center bg-gradient-to-r from-pink-500 to-amber-500 hover:from-pink-600 hover:to-amber-600 shadow-lg shadow-pink-500/25"
                    onClick={handleStartTour}
                  >
                    <Sparkles className="size-4" />
                    <span>{t('tour.startTour')}</span>
                    <ArrowRight className="size-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 justify-center"
                    onClick={handleClose}
                  >
                    <span>{t('tour.skipForNow')}</span>
                  </Button>

                  <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                    {t('tour.accessLater')}
                  </p>
                </motion.div>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
