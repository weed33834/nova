'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/lib/store/onboarding';
import { getTourStepsForPage } from '@/lib/tour/steps';
import { TourSpotlight, TourControls } from '@/components/tour/TourSpotlight';
import { WelcomeModal } from '@/components/tour/WelcomeModal';
import { cn } from '@/lib/utils';

interface TourProviderProps {
  children: React.ReactNode;
}

export function TourProvider({ children }: TourProviderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const {
    hasSeenWelcome,
    hasCompletedTour,
    isTourActive,
    currentTourStep,
    startTour,
    endTour,
    nextTourStep,
    prevTourStep,
    setHasSeenWelcome,
    setHasCompletedTour,
  } = useOnboardingStore();

  const steps = getTourStepsForPage(pathname);
  const isLastStep = currentTourStep >= steps.length - 1;

  // Check if current step's target exists
  const currentStepRef = useRef<HTMLElement | null>(null);
  const stepCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-start welcome modal for new users on homepage
  useEffect(() => {
    if (pathname === '/' && !hasSeenWelcome && !hasCompletedTour) {
      // Small delay to let the page render
      const timer = setTimeout(() => {
        setHasSeenWelcome(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [pathname, hasSeenWelcome, hasCompletedTour, setHasSeenWelcome]);

  // Handle tour navigation
  const handleNext = useCallback(() => {
    if (isLastStep) {
      endTour();
      // Navigate to classroom if we're on generation-preview
      if (pathname.startsWith('/generation-preview')) {
        // The generation will handle navigation
      }
    } else {
      nextTourStep();
    }
  }, [isLastStep, endTour, nextTourStep, pathname]);

  const handlePrev = useCallback(() => {
    prevTourStep();
  }, [prevTourStep]);

  const handleStartTour = useCallback(() => {
    startTour();
  }, [startTour]);

  const handleEndTour = useCallback(() => {
    endTour();
  }, [endTour]);

  const handleWelcomeClose = useCallback(() => {
    setHasSeenWelcome(true);
  }, [setHasSeenWelcome]);

  // Check if target element exists for current step
  const checkStepTarget = useCallback(() => {
    if (!isTourActive || steps.length === 0) return;

    const step = steps[currentTourStep];
    if (!step) return;

    const target = document.querySelector(step.targetSelector);
    if (target) {
      currentStepRef.current = target as HTMLElement;
    } else if (step.isOptional) {
      // Skip optional steps that don't exist
      if (isLastStep) {
        endTour();
      } else {
        nextTourStep();
      }
    }
  }, [isTourActive, steps, currentTourStep, isLastStep, endTour, nextTourStep]);

  // Run check on step change and periodically
  useEffect(() => {
    checkStepTarget();

    stepCheckIntervalRef.current = setInterval(checkStepTarget, 500);
    return () => {
      if (stepCheckIntervalRef.current) clearInterval(stepCheckIntervalRef.current);
    };
  }, [checkStepTarget]);

  // Scroll to target when step changes
  useEffect(() => {
    if (!isTourActive) return;
    if (currentStepRef.current) {
      currentStepRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
    }
  }, [currentTourStep, isTourActive]);

  // Prevent body scroll during tour
  useEffect(() => {
    if (isTourActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isTourActive]);

  return (
    <>
      {children}

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={pathname === '/' && !hasSeenWelcome && !hasCompletedTour}
        onClose={handleWelcomeClose}
        onStartTour={handleStartTour}
      />

      {/* Tour Spotlight Overlay */}
      {isTourActive && steps.length > 0 && steps[currentTourStep] && (
        <TourSpotlight
          step={steps[currentTourStep]}
          isVisible={isTourActive}
          onClose={handleEndTour}
          onNext={handleNext}
          onPrev={handlePrev}
          currentStep={currentTourStep}
          totalSteps={steps.length}
        />
      )}

      {/* Tour Controls - Floating button when not active, compact when active */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-50 transition-all duration-300',
          isTourActive ? 'bottom-4 right-4' : '',
        )}
      >
        <TourControls
          isActive={isTourActive}
          currentStep={currentTourStep}
          totalSteps={steps.length}
          onStart={handleStartTour}
          onClose={handleEndTour}
        />
      </div>

      {/* Keyboard shortcuts */}
      <TourKeyboardShortcuts
        isActive={isTourActive}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleEndTour}
      />
    </>
  );
}

function TourKeyboardShortcuts({
  isActive,
  onNext,
  onPrev,
  onClose,
}: {
  isActive: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'Enter':
          e.preventDefault();
          onNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onPrev();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onNext, onPrev, onClose]);

  return null;
}
