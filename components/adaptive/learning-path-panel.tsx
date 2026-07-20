'use client';

import { useState } from 'react';
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
  Target,
  Clock,
  Sparkles,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import { AdaptiveScheduler } from '@/lib/adaptive/scheduler/engine';
import type { LearningSchedule, ScheduledItem } from '@/lib/adaptive/scheduler/types';
import { createKnowledgeGraph } from '@/lib/adaptive/knowledge-graph/graph';
import { createEmptyKnowledgeState } from '@/lib/adaptive/knowledge-graph/types';

const DEMO_GRAPH = createKnowledgeGraph(
  'home-kg',
  '学习知识图谱',
  'general',
  [
    {
      id: 'h-concept-1',
      label: 'Python基础语法',
      description: '变量、数据类型、控制流',
      category: 'prerequisite',
      difficulty: 2,
      keywords: ['Python', '语法', '变量'],
      estimatedMinutes: 45,
    },
    {
      id: 'h-concept-2',
      label: '数据结构',
      description: '列表、字典、元组、集合',
      category: 'core',
      difficulty: 4,
      keywords: ['数据结构', '列表', '字典'],
      estimatedMinutes: 60,
    },
    {
      id: 'h-concept-3',
      label: '函数与模块',
      description: '函数定义、参数、模块导入',
      category: 'core',
      difficulty: 4,
      keywords: ['函数', '模块'],
      estimatedMinutes: 50,
    },
    {
      id: 'h-concept-4',
      label: '面向对象编程',
      description: '类、继承、多态',
      category: 'advanced',
      difficulty: 6,
      keywords: ['OOP', '类', '继承'],
      estimatedMinutes: 75,
    },
    {
      id: 'h-concept-5',
      label: '实战项目',
      description: '综合项目实践',
      category: 'application',
      difficulty: 8,
      keywords: ['项目', '实战'],
      estimatedMinutes: 120,
    },
  ],
  [
    { source: 'h-concept-1', target: 'h-concept-2', relation: 'requires', weight: 1 },
    { source: 'h-concept-1', target: 'h-concept-3', relation: 'requires', weight: 0.8 },
    { source: 'h-concept-2', target: 'h-concept-4', relation: 'requires', weight: 1 },
    { source: 'h-concept-3', target: 'h-concept-4', relation: 'enhances', weight: 0.6 },
    { source: 'h-concept-4', target: 'h-concept-5', relation: 'enhances', weight: 0.9 },
  ],
);

export function LearningPathPanel() {
  const { t } = useI18n();
  const profile = useProfileStore((s) => s.profile);
  const [expanded, setExpanded] = useState(false);

  let schedule: LearningSchedule | null = null;
  if (profile) {
    const result = new AdaptiveScheduler().generateSchedule(
      DEMO_GRAPH,
      profile,
      createEmptyKnowledgeState(DEMO_GRAPH.id),
      undefined,
      'prerequisite_first',
    );
    schedule = result.schedule;
  }

  if (!profile || !schedule?.items.length) {
    return (
      <Card className="overflow-hidden border-dashed">
        <div className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/5">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground">推荐学习路径</h3>
            <p className="text-xs text-muted-foreground">
              完成学习画像后，将为你生成个性化学习路径
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const depthColors: Record<string, string> = {
    surface: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    normal: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    deep: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  };

  return (
    <Card className="overflow-hidden border-primary/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/5">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">推荐学习路径</h3>
            <p className="text-xs text-muted-foreground">
              {schedule.totalItems} 个知识点 · 约 {schedule.totalEstimatedMinutes} 分钟
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {schedule.strategy === 'prerequisite_first' ? '前置优先' : schedule.strategy}
          </Badge>
          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t">
          <ScrollArea className="h-[240px] p-4">
            <div className="space-y-2">
              {schedule.items.map((item) => (
                <div
                  key={item.conceptId}
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-[10px] font-medium shrink-0 mt-0.5">
                    {item.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.concept.label}</span>
                      <Badge className={cn('text-[10px] px-1.5 py-0', depthColors[item.depth])}>
                        {item.depth === 'surface'
                          ? '概览'
                          : item.depth === 'normal'
                            ? '标准'
                            : '深入'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.adaptiveReason}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.estimatedMinutes} 分钟
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        Lv.{item.concept.difficulty}
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" />
                        {item.concept.category === 'prerequisite'
                          ? '前置'
                          : item.concept.category === 'core'
                            ? '核心'
                            : item.concept.category === 'advanced'
                              ? '进阶'
                              : item.concept.category === 'application'
                                ? '应用'
                                : '评估'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-3 border-t bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              根据你的学习画像 ({Math.round(profile.totalStudyTime / 60)}h 学习时间) 生成
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => {
                const graph = DEMO_GRAPH;
                const summary = schedule.items
                  .map(
                    (item, i) =>
                      `${i + 1}. ${item.concept.label} (${item.depth === 'surface' ? '概览' : item.depth === 'normal' ? '标准' : '深入'}, ${item.estimatedMinutes}min)`,
                  )
                  .join('\n');
                alert(
                  `学习路径详情 — ${schedule.totalEstimatedMinutes} 分钟\n\n${summary}\n\n知识点图: ${graph.name} (${graph.nodes.length} 个概念)`,
                );
              }}
            >
              <TrendingUp className="h-3 w-3" /> 查看详情
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
