'use client';

import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  LayoutGrid,
  MessageSquare,
  Maximize2,
  Minimize2,
  PencilLine,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Repeat,
  Square,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MobileBottomBarProps {
  readonly currentSceneIndex: number;
  readonly scenesCount: number;
  readonly engineState: 'idle' | 'playing' | 'paused';
  readonly isLiveSession?: boolean;
  readonly showStopDiscussion?: boolean;
  readonly onStopDiscussion?: () => void;
  readonly onPrevSlide: () => void;
  readonly onNextSlide: () => void;
  readonly onPlayPause: () => void;
  readonly onToggleScenes: () => void;
  readonly onToggleChat: () => void;
  readonly onTogglePresentation?: () => void;
  readonly isPresenting?: boolean;
  readonly onToggleWhiteboard?: () => void;
  readonly whiteboardOpen?: boolean;
  readonly ttsMuted?: boolean;
  readonly onToggleMute?: () => void;
  readonly autoPlayLecture?: boolean;
  readonly onToggleAutoPlay?: () => void;
  readonly playbackSpeed?: number;
  readonly onCycleSpeed?: () => void;
}

/**
 * MobileBottomBar — primary navigation bar for mobile classroom.
 *
 * 5-button layout (all 44px+ touch targets):
 * ┌────────────────────────────────────────────┐
 * │ Scenes │ ◄ │  ▶/⏸  │ ► │  Chat  │
 * └────────────────────────────────────────────┘
 *
 * Overflow menu ("More") contains: fullscreen, whiteboard, volume,
 * speed, auto-play — keeping the bar clean without losing features.
 *
 * Safe area bottom inset is applied for notched devices.
 */
export function MobileBottomBar({
  currentSceneIndex,
  scenesCount,
  engineState,
  isLiveSession,
  showStopDiscussion,
  onStopDiscussion,
  onPrevSlide,
  onNextSlide,
  onPlayPause,
  onToggleScenes,
  onToggleChat,
  onTogglePresentation,
  isPresenting,
  onToggleWhiteboard,
  whiteboardOpen,
  ttsMuted,
  onToggleMute,
  autoPlayLecture,
  onToggleAutoPlay,
  playbackSpeed = 1,
  onCycleSpeed,
}: MobileBottomBarProps) {
  const { t } = useI18n();
  const [overflowOpen, setOverflowOpen] = useState(false);

  const canGoPrev = currentSceneIndex > 0;
  const canGoNext = currentSceneIndex < scenesCount - 1;
  const showPlayPause = !isLiveSession;

  // Shared geometry for secondary nav buttons. The big play/pause button uses
  // its own size (h-14 w-14) so it stands out as the primary action. These
  // baseline classes are the source of truth for the rest of the bar.
  const btnBase = cn(
    'flex items-center justify-center rounded-xl transition-all active:scale-90',
    'h-12 w-12 min-h-[44px] min-w-[44px]',
  );

  const navBtn = cn(
    btnBase,
    'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
    'disabled:opacity-30 disabled:pointer-events-none',
  );

  // Same fixed button footprint for both endpoints so the bar stays balanced
  // regardless of whether the previous/next arrows are visible (single-scene
  // courses hide the arrows, which would otherwise leave the play button
  // off-center).
  const sideBtn = cn(
    btnBase,
    'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 relative',
  );

  return (
    <nav
      className={cn(
        'shrink-0 flex items-center justify-between px-2 gap-1',
        'h-16 min-h-[56px]',
        'bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl',
        'border-t border-gray-200/60 dark:border-gray-800/60',
        'pb-[var(--safe-area-bottom)]',
      )}
    >
      {/* Left: Scenes toggle */}
      <button
        onClick={onToggleScenes}
        className={sideBtn}
        aria-label={t('stage.scenes') || 'Scenes'}
      >
        <LayoutGrid className="w-5 h-5" />
        {scenesCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[10px] font-bold tabular-nums bg-pink-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 ring-2 ring-white dark:ring-gray-900">
            {scenesCount}
          </span>
        )}
      </button>

      {/* Center-left: Previous */}
      {scenesCount > 1 && (
        <button
          onClick={onPrevSlide}
          disabled={!canGoPrev}
          className={navBtn}
          aria-label={t('stage.previousScene')}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Center: Play/Pause or Stop Discussion */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (showStopDiscussion && onStopDiscussion) {
            onStopDiscussion();
          } else if (showPlayPause) {
            onPlayPause();
          }
        }}
        className={cn(
          'flex items-center justify-center rounded-full transition-all active:scale-90',
          'h-14 w-14 min-h-[44px] min-w-[44px]',
          'shadow-lg',
          showStopDiscussion
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
            : engineState === 'playing'
              ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-pink-500/30'
              : 'bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600 text-white shadow-gray-500/20',
        )}
        aria-label={
          showStopDiscussion
            ? t('roundtable.stopDiscussion')
            : engineState === 'playing'
              ? t('stage.pause')
              : t('stage.play')
        }
      >
        {showStopDiscussion ? (
          <Square className="w-5 h-5 fill-current" />
        ) : engineState === 'playing' ? (
          <Pause className="w-6 h-6 fill-current" />
        ) : (
          <Play className="w-6 h-6 fill-current ml-0.5" />
        )}
      </button>

      {/* Center-right: Next */}
      {scenesCount > 1 && (
        <button
          onClick={onNextSlide}
          disabled={!canGoNext}
          className={navBtn}
          aria-label={t('stage.nextScene')}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Right: Chat toggle */}
      <button
        onClick={onToggleChat}
        className={sideBtn}
        aria-label={t('stage.toggleChat')}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Overflow menu for secondary controls */}
      <DropdownMenu open={overflowOpen} onOpenChange={setOverflowOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            className={sideBtn}
            aria-label={t('stage.moreControls')}
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="min-w-[180px]">
          {/* Fullscreen / Present */}
          {onTogglePresentation && (
            <DropdownMenuItem
              onSelect={() => onTogglePresentation()}
              className="cursor-pointer gap-2.5"
            >
              {isPresenting ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isPresenting ? t('stage.exitFullscreen') : t('stage.fullscreen')}</span>
            </DropdownMenuItem>
          )}

          {/* Whiteboard */}
          {onToggleWhiteboard && (
            <DropdownMenuItem
              onSelect={() => onToggleWhiteboard()}
              className={cn(
                'cursor-pointer gap-2.5',
                whiteboardOpen && 'text-pink-600 dark:text-pink-400',
              )}
            >
              <PencilLine className="w-4 h-4" />
              <span>{whiteboardOpen ? t('whiteboard.minimize') : t('whiteboard.open')}</span>
            </DropdownMenuItem>
          )}

          {/* Volume */}
          {onToggleMute && (
            <DropdownMenuItem
              onSelect={() => onToggleMute()}
              className="cursor-pointer gap-2.5"
            >
              {ttsMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{ttsMuted ? t('audio.unmute') : t('audio.mute')}</span>
            </DropdownMenuItem>
          )}

          {/* Playback speed */}
          {onCycleSpeed && (
            <DropdownMenuItem
              onSelect={() => onCycleSpeed()}
              className={cn(
                'cursor-pointer gap-2.5',
                playbackSpeed !== 1 && 'text-pink-600 dark:text-pink-400',
              )}
            >
              <span className="w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {playbackSpeed}x
              </span>
              <span>{t('roundtable.speed')}</span>
            </DropdownMenuItem>
          )}

          {/* Auto-play */}
          {onToggleAutoPlay && (
            <DropdownMenuItem
              onSelect={() => onToggleAutoPlay()}
              className={cn(
                'cursor-pointer gap-2.5',
                autoPlayLecture && 'text-pink-600 dark:text-pink-400',
              )}
            >
              <Repeat className="w-4 h-4" />
              <span>{autoPlayLecture ? t('roundtable.autoPlayOff') : t('roundtable.autoPlay')}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
