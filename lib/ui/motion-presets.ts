/**
 * Global animation constants for Nova UI transitions.
 *
 * Centralizes the motion easing curves, durations, and stagger values used
 * across the app so transitions feel cohesive. The Pro-mode chrome constants
 * in `lib/edit/transitions.ts` remain separate (they're tuned for the slide
 * editor's layoutId shared-element choreography), but share the same base
 * ease curve.
 *
 * Usage:
 *   import { motion } from 'motion/react';
 *   import { FADE_IN, SPRING_ENTRY } from '@/lib/ui/motion-presets';
 *   <motion.div {...FADE_IN}>...</motion.div>
 */
import type { Transition, Variants } from 'motion/react';

// ── Easing curves ───────────────────────────────────────────────────────────

/** Ease-out-quart — natural deceleration, Nova's primary ease. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Ease-in-out — symmetric acceleration/deceleration for bidirectional flows. */
export const EASE_IN_OUT = [0.42, 0, 0.58, 1] as const;

// ── Durations (seconds) ─────────────────────────────────────────────────────

export const DURATION_FAST = 0.2;
export const DURATION_NORMAL = 0.35;
export const DURATION_SLOW = 0.6;

// ── Stagger ─────────────────────────────────────────────────────────────────

export const STAGGER_FAST = 0.04;
export const STAGGER_NORMAL = 0.08;
export const STAGGER_SLOW = 0.12;

// ── Spring presets ──────────────────────────────────────────────────────────

/** Gentle spring for logos, icons, and emphasis elements. */
export const SPRING_GENTLE: Transition = { type: 'spring', stiffness: 200, damping: 18 };

/** Snappy spring for buttons, toggles, and interactive feedback. */
export const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 300, damping: 25 };

/** Soft spring for modals and large panels. */
export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 120, damping: 20 };

// ── Motion variant presets ──────────────────────────────────────────────────

/** Fade + slide up — standard content entrance. */
export const FADE_IN: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_SLOW, ease: EASE_OUT } },
};

/** Fade + scale — card/modal entrance. */
export const SCALE_IN: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION_NORMAL, ease: EASE_OUT } },
};

/** Pure fade — for overlays and backdrops. */
export const FADE_ONLY: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION_NORMAL, ease: EASE_OUT } },
};

/** Staggered container — children animate in sequence. */
export const STAGGER_CONTAINER: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: STAGGER_NORMAL, delayChildren: 0.05 },
  },
};

/** Staggered child item — pair with STAGGER_CONTAINER. */
export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION_NORMAL, ease: EASE_OUT } },
};

/** Exit fade — for AnimatePresence exit states. */
export const FADE_OUT: Variants = {
  exit: { opacity: 0, scale: 1.02, transition: { duration: DURATION_FAST, ease: EASE_OUT } },
};

// ── Reduced motion ──────────────────────────────────────────────────────────

/**
 * Respects `prefers-reduced-motion` by collapsing transitions to near-instant
 * opacity changes. Pass as `transition` or merge into variants.
 */
export const REDUCED_MOTION: Transition = {
  duration: 0.01,
  ease: 'linear' as const,
};
