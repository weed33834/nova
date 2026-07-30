'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  X,
} from 'lucide-react';
import type {
  KnowledgeGraph,
  ConceptNode,
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

const CATEGORY_LABEL_KEY: Record<ConceptCategory, string> = {
  prerequisite: 'adaptive.category.prerequisite',
  core: 'adaptive.category.core',
  advanced: 'adaptive.category.advanced',
  application: 'adaptive.category.application',
  assessment: 'adaptive.category.assessment',
};

const RELATION_LABEL_KEY: Record<string, string> = {
  requires: 'adaptive.relation.requires',
  enhances: 'adaptive.relation.enhances',
};

export function KnowledgeGraphPanel() {
  const { t } = useI18n();
  const [graph, setGraph] = useState<KnowledgeGraph>(() =>
    createKnowledgeGraph(
      'default-kg',
      t('adaptive.kgPanel.defaultName'),
      'general',
      [
        {
          id: 'concept-1',
          label: t('adaptive.kgPanel.fundamentals.label'),
          description: t('adaptive.kgPanel.fundamentals.desc'),
          category: 'prerequisite',
          difficulty: 2,
          keywords: [t('adaptive.kgPanel.fundamentals.kw1'), t('adaptive.kgPanel.fundamentals.kw2')],
          estimatedMinutes: 30,
        },
        {
          id: 'concept-2',
          label: t('adaptive.kgPanel.core.label'),
          description: t('adaptive.kgPanel.core.desc'),
          category: 'core',
          difficulty: 4,
          keywords: [t('adaptive.kgPanel.core.kw1'), t('adaptive.kgPanel.core.kw2')],
          estimatedMinutes: 45,
        },
        {
          id: 'concept-3',
          label: t('adaptive.kgPanel.advanced.label'),
          description: t('adaptive.kgPanel.advanced.desc'),
          category: 'advanced',
          difficulty: 7,
          keywords: [t('adaptive.kgPanel.advanced.kw1'), t('adaptive.kgPanel.advanced.kw2')],
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
  // Mobile: toggle between list view and detail view
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // Re-localize the demo graph whenever the locale changes.
  const localizedGraph = useMemo<KnowledgeGraph>(() => {
    return createKnowledgeGraph(
      graph.id,
      t('adaptive.kgPanel.defaultName'),
      graph.subject,
      graph.nodes.map((n) => {
        if (n.id === 'concept-1') {
          return {
            ...n,
            label: t('adaptive.kgPanel.fundamentals.label'),
            description: t('adaptive.kgPanel.fundamentals.desc'),
            keywords: [t('adaptive.kgPanel.fundamentals.kw1'), t('adaptive.kgPanel.fundamentals.kw2')],
          };
        }
        if (n.id === 'concept-2') {
          return {
            ...n,
            label: t('adaptive.kgPanel.core.label'),
            description: t('adaptive.kgPanel.core.desc'),
            keywords: [t('adaptive.kgPanel.core.kw1'), t('adaptive.kgPanel.core.kw2')],
          };
        }
        if (n.id === 'concept-3') {
          return {
            ...n,
            label: t('adaptive.kgPanel.advanced.label'),
            description: t('adaptive.kgPanel.advanced.desc'),
            keywords: [t('adaptive.kgPanel.advanced.kw1'), t('adaptive.kgPanel.advanced.kw2')],
          };
        }
        return n;
      }),
      graph.edges,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, graph.id, graph.subject, graph.edges, graph.nodes]);

  const handleAddConcept = () => {
    if (!newConceptLabel.trim()) return;
    const id = `concept-${Date.now()}`;
    const concept: ConceptNode = {
      id,
      label: newConceptLabel.trim(),
      description: t('adaptive.kgPanel.conceptDescription', { name: newConceptLabel.trim() }),
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
    if (selectedNode === id) {
      setSelectedNode(null);
      setMobileView('list');
    }
  };

  const handleAddRelation = (sourceId: string, targetId: string) => {
    setGraph((prev) =>
      addEdge(prev, { source: sourceId, target: targetId, relation: 'requires', weight: 1 }),
    );
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    // On mobile, switch to detail view when a node is selected
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setMobileView('detail');
    }
  };

  const filteredNodes = localizedGraph.nodes.filter(
    (n) =>
      !searchQuery ||
      n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.keywords.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const getNodeColor = (nodeId: string) => {
    const node = localizedGraph.nodes.find((n) => n.id === nodeId);
    return node ? CATEGORY_COLORS[node.category] : '';
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ── Toolbar: search + add concept ──
          Mobile: stacked vertically with full-width inputs.
          Desktop: single row with inline inputs. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            placeholder={t('adaptive.kgPanel.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-40 h-9 sm:h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder={t('adaptive.kgPanel.newConceptPlaceholder')}
            value={newConceptLabel}
            onChange={(e) => setNewConceptLabel(e.target.value)}
            className="flex-1 sm:flex-initial sm:w-36 h-9 sm:h-8 text-sm min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && handleAddConcept()}
          />
          <select
            value={newConceptCategory}
            onChange={(e) => setNewConceptCategory(e.target.value as ConceptCategory)}
            className="h-9 sm:h-8 text-xs rounded-md border bg-background px-2 shrink-0"
            aria-label={t('adaptive.kgPanel.categoryLabel')}
          >
            {(['prerequisite', 'core', 'advanced', 'application', 'assessment'] as const).map(
              (c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_LABEL_KEY[c])}
                </option>
              ),
            )}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddConcept}
            className="h-9 sm:h-8 gap-1 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" /> {t('adaptive.kgPanel.add')}
          </Button>
        </div>
      </div>

      {/* ── Main grid: concept list + details panel ──
          Desktop: side-by-side (1fr | 240px)
          Mobile: tabbed view — list OR detail, not both */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px] gap-3 sm:gap-4">
        {/* Concept List — visible on desktop always, on mobile only in 'list' view */}
        <Card className={cn('p-3 sm:p-4', mobileView === 'detail' && 'hidden sm:block')}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link2 className="h-4 w-4" />
            <span>
              {t('adaptive.kgPanel.stats', {
                nodes: localizedGraph.nodes.length,
                edges: localizedGraph.edges.length,
              })}
            </span>
          </div>
          <ScrollArea className="h-[280px] sm:h-[300px]">
            <div className="space-y-2">
              {filteredNodes.map((node) => (
                <div
                  key={node.id}
                  className={cn(
                    'p-2.5 sm:p-3 rounded-lg border cursor-pointer transition-all',
                    getNodeColor(node.id),
                    selectedNode === node.id && 'ring-2 ring-primary',
                  )}
                  onClick={() => handleSelectNode(node.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {CATEGORY_ICONS[node.category]}
                      <span className="font-medium text-sm truncate">{node.label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {t('common.level')}{node.difficulty}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 sm:h-6 sm:w-6"
                        aria-label={t('common.delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveConcept(node.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{node.description}</p>

                  {/* Outgoing relations */}
                  {localizedGraph.edges.filter((e) => e.source === node.id).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {localizedGraph.edges
                        .filter((e) => e.source === node.id)
                        .map((edge) => {
                          const target = localizedGraph.nodes.find((n) => n.id === edge.target);
                          const relKey = RELATION_LABEL_KEY[edge.relation] ?? edge.relation;
                          return (
                            <Badge
                              key={`${edge.source}-${edge.target}`}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              → {target?.label || edge.target} ({t(relKey)})
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
                      className="h-7 text-[10px] mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddRelation(selectedNode, node.id);
                      }}
                    >
                      + {t('adaptive.kgPanel.linkToSelected')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Details Panel — visible on desktop always, on mobile only in 'detail' view */}
        <Card className={cn('p-3 sm:p-4', mobileView === 'list' && 'hidden sm:block')}>
          {/* Mobile: back button to return to list */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">{t('adaptive.kgPanel.detailsTitle')}</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:hidden"
              onClick={() => setMobileView('list')}
              aria-label={t('common.back') || 'Back'}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {selectedNode ? (
            (() => {
              const node = localizedGraph.nodes.find((n) => n.id === selectedNode);
              if (!node)
                return (
                  <div className="text-sm text-muted-foreground">
                    {t('adaptive.kgPanel.notFound')}
                  </div>
                );
              const prereqs = localizedGraph.edges.filter((e) => e.target === node.id);
              const deps = localizedGraph.edges.filter((e) => e.source === node.id);
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">{t('adaptive.kgPanel.label')}</span>
                    <p className="font-medium">{node.label}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {t('adaptive.kgPanel.category')}
                    </span>
                    <Badge className="ml-2 text-[10px]">
                      {t(CATEGORY_LABEL_KEY[node.category] ?? 'adaptive.category.core')}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {t('adaptive.kgPanel.difficulty')}
                    </span>
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
                      {t('adaptive.kgPanel.prereqs', { count: prereqs.length })}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {prereqs.map((p) => {
                        const pn = localizedGraph.nodes.find((n) => n.id === p.source);
                        return (
                          <Badge key={p.source} variant="outline" className="text-[10px]">
                            {pn?.label || p.source}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {t('adaptive.kgPanel.deps', { count: deps.length })}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {deps.map((d) => {
                        const dn = localizedGraph.nodes.find((n) => n.id === d.target);
                        return (
                          <Badge key={d.target} variant="outline" className="text-[10px]">
                            {dn?.label || d.target}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {t('adaptive.kgPanel.keywords')}
                    </span>
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
            <div className="text-sm text-muted-foreground">
              {t('adaptive.kgPanel.selectConcept')}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
