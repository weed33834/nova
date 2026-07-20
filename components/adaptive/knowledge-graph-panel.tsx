'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  Plus,
  Network,
  Link2,
  Search,
  Trash2,
  BookOpen,
  Lightbulb,
  Target,
  Layers,
} from 'lucide-react';
import type {
  KnowledgeGraph,
  ConceptNode,
  ConceptEdge,
  ConceptCategory,
} from '@/lib/adaptive/knowledge-graph/types';
import { createKnowledgeGraph, addNode, addEdge } from '@/lib/adaptive/knowledge-graph/graph';

const CATEGORY_ICONS: Record<ConceptCategory, React.ReactNode> = {
  prerequisite: <Layers className="h-3.5 w-3.5" />,
  core: <BookOpen className="h-3.5 w-3.5" />,
  advanced: <Lightbulb className="h-3.5 w-3.5" />,
  application: <Target className="h-3.5 w-3.5" />,
  assessment: <Search className="h-3.5 w-3.5" />,
};

const CATEGORY_COLORS: Record<ConceptCategory, string> = {
  prerequisite:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
  core: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800',
  advanced:
    'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-800',
  application:
    'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800',
  assessment:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800',
};

export function KnowledgeGraphPanel() {
  const { t } = useI18n();
  const [graph, setGraph] = useState<KnowledgeGraph>(() =>
    createKnowledgeGraph(
      'default-kg',
      '默认知识图谱',
      'general',
      [
        {
          id: 'concept-1',
          label: '基础知识',
          description: '学科基础知识',
          category: 'prerequisite',
          difficulty: 2,
          keywords: ['基础', '入门'],
          estimatedMinutes: 30,
        },
        {
          id: 'concept-2',
          label: '核心概念',
          description: '核心知识点',
          category: 'core',
          difficulty: 4,
          keywords: ['核心', '重点'],
          estimatedMinutes: 45,
        },
        {
          id: 'concept-3',
          label: '进阶应用',
          description: '高级应用',
          category: 'advanced',
          difficulty: 7,
          keywords: ['进阶', '高级'],
          estimatedMinutes: 60,
        },
      ],
      [
        { source: 'concept-1', target: 'concept-2', relation: 'requires', weight: 1 },
        { source: 'concept-2', target: 'concept-3', relation: 'enhances', weight: 0.8 },
      ],
    ),
  );
  const [newConceptLabel, setNewConceptLabel] = useState('');
  const [newConceptCategory, setNewConceptCategory] = useState<ConceptCategory>('core');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const handleAddConcept = () => {
    if (!newConceptLabel.trim()) return;
    const id = `concept-${Date.now()}`;
    const concept: ConceptNode = {
      id,
      label: newConceptLabel.trim(),
      description: `概念: ${newConceptLabel.trim()}`,
      category: newConceptCategory,
      difficulty: 3,
      keywords: [newConceptLabel.trim()],
      estimatedMinutes: 30,
    };
    setGraph((prev) => addNode(prev, concept));
    setNewConceptLabel('');
  };

  const handleRemoveConcept = (id: string) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  };

  const handleAddRelation = (sourceId: string, targetId: string) => {
    setGraph((prev) =>
      addEdge(prev, { source: sourceId, target: targetId, relation: 'requires', weight: 1 }),
    );
  };

  const filteredNodes = graph.nodes.filter(
    (n) =>
      !searchQuery ||
      n.label.includes(searchQuery) ||
      n.keywords.some((k) => k.includes(searchQuery)),
  );

  const getNodeColor = (nodeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    return node ? CATEGORY_COLORS[node.category] : '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="搜索概念..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-40 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="新概念名称"
            value={newConceptLabel}
            onChange={(e) => setNewConceptLabel(e.target.value)}
            className="w-36 h-8 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleAddConcept()}
          />
          <select
            value={newConceptCategory}
            onChange={(e) => setNewConceptCategory(e.target.value as ConceptCategory)}
            className="h-8 text-xs rounded-md border bg-background px-2"
          >
            <option value="prerequisite">前置</option>
            <option value="core">核心</option>
            <option value="advanced">进阶</option>
            <option value="application">应用</option>
            <option value="assessment">评估</option>
          </select>
          <Button size="sm" variant="outline" onClick={handleAddConcept} className="h-8 gap-1">
            <Plus className="h-3.5 w-3.5" /> 添加
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_240px] gap-4">
        {/* Concept List */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link2 className="h-4 w-4" />
            <span>
              概念 ({graph.nodes.length}) / 关系 ({graph.edges.length})
            </span>
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {filteredNodes.map((node) => (
                <div
                  key={node.id}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-all',
                    getNodeColor(node.id),
                    selectedNode === node.id && 'ring-2 ring-primary',
                  )}
                  onClick={() => setSelectedNode(node.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {CATEGORY_ICONS[node.category]}
                      <span className="font-medium text-sm">{node.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        Lv.{node.difficulty}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveConcept(node.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{node.description}</p>

                  {/* Outgoing relations */}
                  {graph.edges.filter((e) => e.source === node.id).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {graph.edges
                        .filter((e) => e.source === node.id)
                        .map((edge) => {
                          const target = graph.nodes.find((n) => n.id === edge.target);
                          return (
                            <Badge
                              key={`${edge.source}-${edge.target}`}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              → {target?.label || edge.target} ({edge.relation})
                            </Badge>
                          );
                        })}
                    </div>
                  )}

                  {/* Quick add relation */}
                  {selectedNode && selectedNode !== node.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddRelation(selectedNode, node.id);
                      }}
                    >
                      + 关联到选中
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Details Panel */}
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-3">概念详情</h4>
          {selectedNode ? (
            (() => {
              const node = graph.nodes.find((n) => n.id === selectedNode);
              if (!node) return <div className="text-sm text-muted-foreground">未找到概念</div>;
              const prereqs = graph.edges.filter((e) => e.target === node.id);
              const deps = graph.edges.filter((e) => e.source === node.id);
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">标签</span>
                    <p className="font-medium">{node.label}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">类别</span>
                    <Badge className="ml-2 text-[10px]">{node.category}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">难度</span>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                        <div
                          key={d}
                          className={cn(
                            'w-3 h-2 rounded-sm',
                            d <= node.difficulty ? 'bg-primary' : 'bg-muted',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      前置依赖 ({prereqs.length})
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prereqs.map((p) => {
                        const pn = graph.nodes.find((n) => n.id === p.source);
                        return (
                          <Badge key={p.source} variant="outline" className="text-[10px]">
                            {pn?.label || p.source}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">后续概念 ({deps.length})</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {deps.map((d) => {
                        const dn = graph.nodes.find((n) => n.id === d.target);
                        return (
                          <Badge key={d.target} variant="outline" className="text-[10px]">
                            {dn?.label || d.target}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">关键词</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {node.keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px]">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-sm text-muted-foreground">选择一个概念查看详情</div>
          )}
        </Card>
      </div>
    </div>
  );
}
