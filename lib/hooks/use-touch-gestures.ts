/**
 * Touch Gesture Hooks
 *
 * Provides hooks for common touch gestures that are missing from the
 * desktop-first implementation:
 *   - Swipe (left/right/up/down) for scene navigation and panel switching
 *   - Pinch-to-zoom for canvas/whiteboard
 *   - Long press for context menus
 *
 * All hooks use Pointer Events for unified mouse/touch handling.
 */

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

// ── Types ───────────────────────────────────────────────────────────────

export interface SwipeDirection {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  duration: number;
}

export interface UseSwipeOptions {
  threshold?: number; // Minimum distance (px) to register a swipe
  timeout?: number; // Maximum duration (ms) for a swipe (not a slow drag)
  preventDefault?: boolean;
}

/**
 * Detect swipe gestures on a target element.
 *
 * @returns A ref to attach to the swipeable element.
 *
 * @example
 * const swipeRef = useSwipe({
 *   onSwipeLeft: () => nextScene(),
 *   onSwipeRight: () => prevScene(),
 * });
 * return <div ref={swipeRef}>...</div>;
 */
export function useSwipe(
  handlers: {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    onSwipeUp?: () => void;
    onSwipeDown?: () => void;
    onSwipe?: (direction: SwipeDirection) => void;
  },
  options: UseSwipeOptions = {},
) {
  const { threshold = 50, timeout = 500 } = options;
  const ref = useRef<HTMLElement>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handlePointerDown = (e: PointerEvent) => {
      startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const duration = Date.now() - start.t;

      if (duration > timeout) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Horizontal swipe
      if (absDx > absDy && absDx > threshold) {
        const direction = dx > 0 ? 'right' : 'left';
        handlers.onSwipe?.({ direction, distance: absDx, duration });
        if (direction === 'left') handlers.onSwipeLeft?.();
        else handlers.onSwipeRight?.();
      }
      // Vertical swipe
      else if (absDy > absDx && absDy > threshold) {
        const direction = dy > 0 ? 'down' : 'up';
        handlers.onSwipe?.({ direction, distance: absDy, duration });
        if (direction === 'up') handlers.onSwipeUp?.();
        else handlers.onSwipeDown?.();
      }
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlers, threshold, timeout]);

  return ref;
}

// ── usePinchZoom ────────────────────────────────────────────────────────

export interface UsePinchZoomOptions {
  minScale?: number;
  maxScale?: number;
  onScaleChange?: (scale: number) => void;
}

/**
 * Detect pinch-to-zoom gestures.
 * Uses two-finger touch events.
 *
 * @example
 * const { scale, pinchRef } = usePinchZoom({ minScale: 0.5, maxScale: 3 });
 * return <canvas ref={pinchRef} style={{ transform: `scale(${scale})` }} />;
 */
export function usePinchZoom(options: UsePinchZoomOptions = {}) {
  const { minScale = 0.5, maxScale = 3, onScaleChange } = options;
  const [scale, setScale] = useState(1);
  const ref = useRef<HTMLElement>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const getDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistanceRef.current = getDistance(e.touches);
        initialScaleRef.current = scale;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistanceRef.current) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches);
        const ratio = currentDistance / initialDistanceRef.current;
        const newScale = Math.max(minScale, Math.min(maxScale, initialScaleRef.current * ratio));
        setScale(newScale);
        onScaleChange?.(newScale);
      }
    };

    const handleTouchEnd = () => {
      initialDistanceRef.current = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scale, minScale, maxScale, onScaleChange]);

  const resetScale = useCallback(() => {
    setScale(1);
    onScaleChange?.(1);
  }, [onScaleChange]);

  return { scale, setScale, resetScale, ref };
}

// ── useLongPress ────────────────────────────────────────────────────────

export interface UseLongPressOptions {
  threshold?: number; // Duration in ms to trigger long press
  onLongPress?: () => void;
  onClick?: () => void;
}

/**
 * Detect long press gestures for context menus.
 *
 * @example
 * const { ref, isLongPressing } = useLongPress({
 *   onLongPress: () => openContextMenu(),
 * });
 */
export function useLongPress(options: UseLongPressOptions = {}) {
  const { threshold = 500, onLongPress, onClick } = options;
  const ref = useRef<HTMLElement>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handlePointerDown = () => {
      triggeredRef.current = false;
      timeoutRef.current = setTimeout(() => {
        triggeredRef.current = true;
        setIsLongPressing(true);
        onLongPress?.();
      }, threshold);
    };

    const handlePointerUp = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsLongPressing(false);
      if (!triggeredRef.current && onClick) {
        onClick();
      }
    };

    const handlePointerLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsLongPressing(false);
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointerleave', handlePointerLeave);
    el.addEventListener('pointercancel', handlePointerLeave);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointerleave', handlePointerLeave);
      el.removeEventListener('pointercancel', handlePointerLeave);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [threshold, onLongPress, onClick]);

  return { ref, isLongPressing };
}
