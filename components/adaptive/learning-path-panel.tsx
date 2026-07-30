'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useProfileStore } from '@/lib/store/profile';
import {
  BookOpen,
  TrendingUp,
  Clock,
  Sparkles,
  ChevronRight,
  Lightbulb,
  Target,
} from 'lucide-react';
import { AdaptiveScheduler } from '@/lib/adaptive/scheduler/engine';
import type { LearningSchedule } from '@/lib/adaptive/scheduler/types';
import { createKnowledgeGraph } from '@/lib/adaptive/knowledge-graph/graph';
import { createEmptyKnowledgeState } from '@/lib/adaptive/knowledge-graph/types';

// Build the demo graph labels from i18n so every locale renders correctly.
function useDemoGraph(t: (k: string) => string) {
  return useMemo(
    () =>
      createKnowledgeGraph(
        'home-kg',
        t('adaptive.knowledgeGraph'),
        'general',
        [
          {
            id: 'h-concept-1',
            label: t('adaptive.demo.concept1Label'),
            description: t('adaptive.demo.concept1Desc'),
            category: 'prerequisite',
            difficulty: 2,
            keywords: ['Python', 'basics'],
            estimatedMinutes: 45,
          },
          {
            id: 'h-concept-2',
            label: t('adaptive.demo.concept2Label'),
            description: t('adaptive.demo.concept2Desc'),
            category: 'core',
            difficulty: 4,
            keywords: ['data'],
            estimatedMinutes: 60,
          },
          {
            id: 'h-concept-3',
            label: t('adaptive.demo.concept3Label'),
            description: t('adaptive.demo.concept3Desc'),
            category: 'core',
            difficulty: 4,
            keywords: ['function'],
            estimatedMinutes: 50,
          },
          {
            id: 'h-concept-4',
            label: t('adaptive.demo.concept4Label'),
            description: t('adaptive.demo.concept4Desc'),
            category: 'advanced',
            difficulty: 6,
            keywords: ['OOP'],
            estimatedMinutes: 75,
          },
          {
            id: 'h-concept-5',
            label: t('adaptive.demo.concept5Label'),
            description: t('adaptive.demo.concept5Desc'),
            category: 'application',
            difficulty: 8,
            keywords: ['project'],
            estimatedMinutes: 120,
          },
        ],
        [
          { source: 'h-concept-1', target: 'h-concept-2', relation: 'requires', weight: 1 },
          { source: 'h-concept-1', target: 'h-concept-3', relation: 'requires', weight: 0.8 },
          { source: 'h-concept-2', target: 'h-concept-4', relation: 'requires', weight: 1 },
          { source: 'h-concept-3', target: 'h-concept-4', relation: 'enhances', weight: 0.6 },
          { source: 'h-concept-4', target: 'h-concept-5', relation: 'requires', weight: 0.9 },
        ],
      ),
    // Re-build whenever the locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
}

const depthColors: Record<string, string> = {
  surface: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  normal: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  deep: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

const categoryKeys: Record<string, string> = {
  prerequisite: 'adaptive.category.prerequisite',
  core: 'adaptive.category.core',
  advanced: 'adaptive.category.advanced',
  application: 'adaptive.category.application',
  assessment: 'adaptive.category.assessment',
};

const depthKeys: Record<string, string> = {
  surface: 'adaptive.depth.surface',
  normal: 'adaptive.depth.normal',
  deep: 'adaptive.depth.deep',
};

export function LearningPathPanel() {
  const { t } = useI18n();
  const profile = useProfileStore((s) => s.profile);
  const [expanded, setExpanded] = useState(false);

  // Memoize the graph against t() so localization re-renders properly.
  const demoGraph = useDemoGraph(t);

  const schedule: LearningSchedule | null = useMemo(() => {
    if (!profile) return null;
    const result = new AdaptiveScheduler().generateSchedule(
      demoGraph,
      profile,
      createEmptyKnowledgeState(demoGraph.id),
      undefined,
      'prerequisite_first',
    );
    return result.schedule;
  }, [profile, demoGraph]);

  if (!profile || !schedule?.items.length) {
    return (
      <Card className="overflow-hidden border-dashed">
        <div className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/5">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-muted-foreground">
              {t('adaptive.learningPath.title')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t('adaptive.learningPath.emptyDesc')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const strategyKey = `adaptive.strategy.${schedule.strategy}`;
  const strategyLabel = t(strategyKey);
  // If translation missing, fall back to the raw enum value rather than the key path.
  const strategyText = strategyLabel === strategyKey ? schedule.strategy : strategyLabel;

  return (
    <Card className="overflow-hidden border-primary/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div className="p-1.5 sm:p-2 rounded-lg bg-primary/5 shrink-0">
            <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="text-left min-w-0 flex-1">
            <h3 className="font-semibold text-xs sm:text-sm truncate">
              {t('adaptive.learningPath.title')}
            </h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              {t('adaptive.learningPath.summary', {
                count: schedule.totalItems,
                minutes: schedule.totalEstimatedMinutes,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
            {strategyText}
          </Badge>
          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform shrink-0',
              expanded && 'rotate-90',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t">
          <ScrollArea className="h-[220px] sm:h-[240px] p-3 sm:p-4">
            <div className="space-y-2">
              {schedule.items.map((item) => (
                <div
                  key={item.conceptId}
                  className="flex items-start gap-2.5 sm:gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-[10px] font-medium shrink-0 mt-0.5">
                    {item.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-sm truncate min-w-0 flex-1">
                        {item.concept.label}
                      </span>
                      <Badge
                        className={cn(
                          'text-[10px] px-1.5 py-0 shrink-0',
                          depthColors[item.depth] ?? depthColors.normal,
                        )}
                      >
                        {t(depthKeys[item.depth] ?? 'adaptive.depth.normal')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {item.adaptiveReason}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t('adaptive.learningPath.minutes', { n: item.estimatedMinutes })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {t('common.level')}{item.concept.difficulty}
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" />
                        {t(categoryKeys[item.concept.category] ?? 'adaptive.category.core')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-2.5 sm:p-3 border-t bg-muted/20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0 flex-1">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {t('adaptive.learningPath.footer', {
                  hours: Math.round(profile.totalStudyTime / 60),
                })}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={() => {
                const graph = demoGraph;
                const summary = schedule.items
                  .map(
                    (item, i) =>
                      `${i + 1}. ${item.concept.label} (${t(
                        depthKeys[item.depth] ?? 'adaptive.depth.normal',
                      )}, ${t('adaptive.learningPath.minutes', { n: item.estimatedMinutes })})`,
                  )
                  .join('\n');
                // eslint-disable-next-line no-alert
                alert(
                  t('adaptive.learningPath.detailDialog', {
                    minutes: schedule.totalEstimatedMinutes,
                    summary,
                    name: graph.name,
                    count: graph.nodes.length,
                  }),
                );
              }}
            >
              <TrendingUp className="h-3 w-3" />
              {t('adaptive.learningPath.viewDetail')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
