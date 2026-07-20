'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  sideOffset?: number;
  alignOffset?: number;
  action?: ReactNode;
  skipAction?: ReactNode;
  isOptional?: boolean;
}

export const HOMEPAGE_TOUR_STEPS: TourStep[] = [
  {
    id: 'hero-input',
    targetSelector: '[data-tour="hero-input"]',
    title: 'tour.heroInputTitle',
    description: 'tour.heroInputDesc',
    position: 'bottom',
  },
  {
    id: 'course-materials',
    targetSelector: '[data-tour="course-materials"]',
    title: 'tour.materialsTitle',
    description: 'tour.materialsDesc',
    position: 'bottom',
  },
  {
    id: 'web-search',
    targetSelector: '[data-tour="web-search"]',
    title: 'tour.webSearchTitle',
    description: 'tour.webSearchDesc',
    position: 'bottom',
  },
  {
    id: 'interactive-mode',
    targetSelector: '[data-tour="interactive-mode"]',
    title: 'tour.interactiveTitle',
    description: 'tour.interactiveDesc',
    position: 'bottom',
  },
  {
    id: 'settings',
    targetSelector: '[data-tour="settings"]',
    title: 'tour.settingsTitle',
    description: 'tour.settingsDesc',
    position: 'left',
  },
  {
    id: 'recent-classrooms',
    targetSelector: '[data-tour="recent-classrooms"]',
    title: 'tour.recentTitle',
    description: 'tour.recentDesc',
    position: 'top',
  },
];

export const GENERATION_PREVIEW_TOUR_STEPS: TourStep[] = [
  {
    id: 'progress-steps',
    targetSelector: '[data-tour="progress-steps"]',
    title: 'tour.progressTitle',
    description: 'tour.progressDesc',
    position: 'bottom',
  },
  {
    id: 'visualizer',
    targetSelector: '[data-tour="visualizer"]',
    title: 'tour.visualizerTitle',
    description: 'tour.visualizerDesc',
    position: 'right',
  },
  {
    id: 'status-message',
    targetSelector: '[data-tour="status-message"]',
    title: 'tour.statusTitle',
    description: 'tour.statusDesc',
    position: 'top',
  },
];

export const CLASSROOM_TOUR_STEPS: TourStep[] = [
  {
    id: 'stage',
    targetSelector: '[data-tour="stage"]',
    title: 'tour.stageTitle',
    description: 'tour.stageDesc',
    position: 'center',
  },
  {
    id: 'sidebar',
    targetSelector: '[data-tour="sidebar"]',
    title: 'tour.sidebarTitle',
    description: 'tour.sidebarDesc',
    position: 'left',
  },
  {
    id: 'whiteboard',
    targetSelector: '[data-tour="whiteboard"]',
    title: 'tour.whiteboardTitle',
    description: 'tour.whiteboardDesc',
    position: 'top',
  },
];

export function getTourStepsForPage(pathname: string): TourStep[] {
  if (pathname === '/' || pathname === '') return HOMEPAGE_TOUR_STEPS;
  if (pathname.startsWith('/generation-preview')) return GENERATION_PREVIEW_TOUR_STEPS;
  if (pathname.startsWith('/classroom/')) return CLASSROOM_TOUR_STEPS;
  return [];
}
