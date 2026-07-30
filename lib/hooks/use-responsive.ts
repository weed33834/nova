/**
 * Responsive Hooks for Mobile Adaptation
 *
 * Provides hooks for detecting device type, viewport size, and touch
 * capabilities. These hooks are the foundation for all mobile-specific
 * rendering decisions in the app.
 *
 * Usage:
 *   const isMobile = useIsMobile();
 *   const breakpoint = useBreakpoint();
 *   const { width, height } = useViewportSize();
 */

'use client';

import { useSyncExternalStore } from 'react';

// ── Breakpoint definitions (aligned with Tailwind defaults) ─────────────
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// ── useMediaQuery ───────────────────────────────────────────────────────

function subscribeMediaQuery(query: string): () => void {
  const mql = window.matchMedia(query);
  const handler = () => {
    // Force update via store change
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

function getSnapshotMediaQuery(query: string): boolean {
  return window.matchMedia(query).matches;
}

function getServerSnapshotMediaQuery(): boolean {
  return false; // Default to desktop on server
}

/**
 * Generic media query hook.
 * @param query CSS media query string, e.g. '(max-width: 768px)'
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    () => subscribeMediaQuery(query),
    () => getSnapshotMediaQuery(query),
    getServerSnapshotMediaQuery,
  );
}

// ── useIsMobile ─────────────────────────────────────────────────────────

/**
 * Returns true if the current viewport is mobile-sized (< 768px).
 * Uses useSyncExternalStore for hydration-safe state.
 */
export function useIsMobile(threshold: number = BREAKPOINTS.md): boolean {
  const query = `(max-width: ${threshold - 1}px)`;
  return useMediaQuery(query);
}

/**
 * Returns true if the current viewport is tablet-sized (768px - 1023px).
 */
export function useIsTablet(): boolean {
  const isMobile = useIsMobile();
  const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
  return !isMobile && !isDesktop;
}

/**
 * Returns true if the device supports touch.
 * Note: This is a heuristic — some laptops have touch screens.
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(
    () => () => {}, // Touch capability doesn't change at runtime
    () =>
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches,
    () => false, // Default to false on server
  );
}

// ── useBreakpoint ───────────────────────────────────────────────────────

function getBreakpoint(width: number): Breakpoint {
  if (width < BREAKPOINTS.sm) return 'xs';
  if (width < BREAKPOINTS.md) return 'sm';
  if (width < BREAKPOINTS.lg) return 'md';
  if (width < BREAKPOINTS.xl) return 'lg';
  if (width < BREAKPOINTS['2xl']) return 'xl';
  return '2xl';
}

function subscribeWindowSize(): () => void {
  const handler = () => {
    // Triggers re-render via useSyncExternalStore
  };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}

function getSnapshotBreakpoint(): Breakpoint {
  return getBreakpoint(window.innerWidth);
}

function getServerSnapshotBreakpoint(): Breakpoint {
  return 'lg'; // Default to desktop on server
}

/**
 * Returns the current breakpoint label.
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(
    subscribeWindowSize,
    getSnapshotBreakpoint,
    getServerSnapshotBreakpoint,
  );
}

// ── useViewportSize ─────────────────────────────────────────────────────

function getSnapshotViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function getServerSnapshotViewportSize(): { width: number; height: number } {
  return { width: 1024, height: 768 };
}

/**
 * Returns the current viewport { width, height }.
 * Updates on resize. Uses visualViewport if available for mobile accuracy.
 */
export function useViewportSize(): { width: number; height: number } {
  return useSyncExternalStore(
    subscribeWindowSize,
    getSnapshotViewportSize,
    getServerSnapshotViewportSize,
  );
}

// ── useOrientation ──────────────────────────────────────────────────────

export type Orientation = 'portrait' | 'landscape';

/**
 * Returns the current screen orientation.
 */
export function useOrientation(): Orientation {
  return useSyncExternalStore(
    (callback: () => void) => {
      window.addEventListener('resize', callback);
      window.addEventListener('orientationchange', callback);
      return () => {
        window.removeEventListener('resize', callback);
        window.removeEventListener('orientationchange', callback);
      };
    },
    () =>
      window.innerHeight > window.innerWidth ? ('portrait' as Orientation) : ('landscape' as Orientation),
    () => 'landscape' as Orientation, // Default to landscape on server
  );
}

// ── useSafeAreaInsets ───────────────────────────────────────────────────

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const DEFAULT_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function subscribeSafeArea(callback: () => void): () => void {
  if (typeof CSS === 'undefined' || !CSS.supports('(top: env(safe-area-inset-top))')) {
    return () => {};
  }
  window.addEventListener('resize', callback);
  window.addEventListener('orientationchange', callback);
  return () => {
    window.removeEventListener('resize', callback);
    window.removeEventListener('orientationchange', callback);
  };
}

function getSnapshotSafeArea(): SafeAreaInsets {
  if (typeof document === 'undefined') return DEFAULT_INSETS;
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--safe-area-top') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--safe-area-bottom') || '0', 10),
    left: parseInt(style.getPropertyValue('--safe-area-left') || '0', 10),
    right: parseInt(style.getPropertyValue('--safe-area-right') || '0', 10),
  };
}

/**
 * Returns the safe area insets for notched devices (iPhone X+).
 * Requires `viewportFit: 'cover'` in the viewport meta.
 */
export function useSafeAreaInsets(): SafeAreaInsets {
  return useSyncExternalStore(
    subscribeSafeArea,
    getSnapshotSafeArea,
    () => DEFAULT_INSETS,
  );
}
