import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLogger } from '@/lib/logger';

const log = createLogger('Onboarding');

export interface OnboardingState {
  /** Whether the user has seen the full-screen intro splash (Logo + intro + prompts). */
  hasSeenIntro: boolean;
  hasSeenWelcome: boolean;
  hasCompletedTour: boolean;
  currentTourStep: number;
  isTourActive: boolean;
  dismissedHints: Record<string, boolean>;
  setHasSeenIntro: (v: boolean) => void;
  setHasSeenWelcome: (v: boolean) => void;
  setHasCompletedTour: (v: boolean) => void;
  startTour: () => void;
  endTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  dismissHint: (key: string) => void;
  isHintDismissed: (key: string) => boolean;
  resetOnboarding: () => void;
}

const INITIAL_STATE = {
  hasSeenIntro: false,
  hasSeenWelcome: false,
  hasCompletedTour: false,
  currentTourStep: 0,
  isTourActive: false,
  dismissedHints: {},
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setHasSeenIntro: (v) => set({ hasSeenIntro: v }),

      setHasSeenWelcome: (v) => set({ hasSeenWelcome: v }),

      setHasCompletedTour: (v) =>
        set({ hasCompletedTour: v, isTourActive: false, currentTourStep: 0 }),

      startTour: () => {
        log.info('Tour started');
        set({ isTourActive: true, currentTourStep: 0 });
      },

      endTour: () => {
        log.info('Tour ended');
        set({ isTourActive: false, currentTourStep: 0, hasCompletedTour: true });
      },

      nextTourStep: () => set((s) => ({ currentTourStep: s.currentTourStep + 1 })),

      prevTourStep: () => set((s) => ({ currentTourStep: Math.max(0, s.currentTourStep - 1) })),

      dismissHint: (key) =>
        set((s) => ({
          dismissedHints: { ...s.dismissedHints, [key]: true },
        })),

      isHintDismissed: (key) => get().dismissedHints[key] === true,

      resetOnboarding: () => {
        log.info('Onboarding reset');
        set(INITIAL_STATE);
      },
    }),
    {
      name: 'nova-onboarding',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // v1 → v2: add hasSeenIntro (default false so existing users see the intro once)
        const s = (persistedState as Record<string, unknown>) ?? {};
        if (version < 2) {
          s.hasSeenIntro = false;
        }
        return s as unknown as OnboardingState;
      },
    },
  ),
);
