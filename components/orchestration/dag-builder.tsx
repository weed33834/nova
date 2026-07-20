'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  Plus,
  Play,
  GitBranch,
  Workflow,
  Settings2,
  Trash2,
  GripVertical,
  Split,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { TaskNode, TaskEdge, TaskDAG, TaskStage } from '@/lib/orchestration/dag/types';
import { buildExecutionPlan, topologicalSort } from '@/lib/orchestration/dag/scheduler';

const NODE_TYPE_LABELS: Record<string, string> = {
  agent_response: '智能体响应',
  llm_call: 'LLM 调用',
  tool_execution: '工具执行',
  parallel_group: '并行组',
  condition: '条件判断',
};

const NODE_TYPE_COLORS: Record<string, string> = {
  agent_response: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  llm_call: 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
  tool_execution: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
  parallel_group: 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
  condition: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
};

export function DAGWorkflowBuilder() {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<TaskNode[]>([
    { id: 'node-1', type: 'agent_response', label: '教师讲解', agentId: 'default-1' },
    { id: 'node-2', type: 'agent_response', label: '助教补充', agentId: 'default-2' },
  ]);
  const [edges, setEdges] = useState<TaskEdge[]>([{ from: 'node-1', to: 'node-2' }]);
  const [dagName, setDagName] = useState('默认工作流');
  const [plan, setPlan] = useState<TaskStage[] | null>(null);
  const [showPlan, setShowPlan] = useState(false);

  const addNode = () => {
    const id = `node-${Date.now()}`;
    setNodes((prev) => [
      ...prev,
      { id, type: 'agent_response', label: `新节点 ${prev.length + 1}`, agentId: 'default-1' },
    ]);
  };

  const removeNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
  };

  const updateNode = (id: string, updates: Partial<TaskNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  };

  const addEdge = (from: string, to: string) => {
    if (edges.some((e) => e.from === from && e.to === to)) return;
    setEdges((prev) => [...prev, { from, to }]);
  };

  const removeEdge = (from: string, to: string) => {
    setEdges((prev) => prev.filter((e) => !(e.from === from && e.to === to)));
  };

  const generatePlan = () => {
    const dag: TaskDAG = {
      id: `dag-${Date.now()}`,
      nodes,
      edges,
      metadata: { name: dagName, created: Date.now() },
    };
    try {
      const executionPlan = buildExecutionPlan(dag);
      setPlan(executionPlan.stages);
      setShowPlan(true);
    } catch (e) {
      setPlan(null);
      setShowPlan(true);
    }
  };

  const dag: TaskDAG = { id: 'preview', nodes, edges };
  const topoResult = topologicalSort(nodes, edges);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          此 DAG 编辑器目前为设计预览模式，尚未接入运行时编排引擎（运行时使用 LangGraph StateGraph）。
          编辑结果不会持久化，仅用于可视化演示。后续版本将接入实际调度。
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="h-5 w-5 text-muted-foreground" />
          <Input
            value={dagName}
            onChange={(e) => setDagName(e.target.value)}
            className="w-48 h-8 text-sm font-medium"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addNode} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> 添加节点
          </Button>
          <Button size="sm" onClick={generatePlan} className="gap-1.5">
            <Play className="h-3.5 w-3.5" /> 生成执行计划
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4">
        {/* DAG Editor */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <GitBranch className="h-4 w-4" />
            <span>
              节点 ({nodes.length}) / 依赖 ({edges.length})
            </span>
            {topoResult.cycle && (
              <Badge variant="destructive" className="text-[10px]">
                检测到循环依赖
              </Badge>
            )}
          </div>

          <ScrollArea className="h-[320px]">
            <div className="space-y-2">
              {nodes.map((node, idx) => (
                <div
                  key={node.id}
                  className={cn('p-3 rounded-lg border', NODE_TYPE_COLORS[node.type] || '')}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Input
                        value={node.label}
                        onChange={(e) => updateNode(node.id, { label: e.target.value })}
                        className="h-7 text-sm font-medium"
                      />
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {NODE_TYPE_LABELS[node.type] || node.type}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeNode(node.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{node.id}</span>
                    {node.agentId && <span>智能体: {node.agentId}</span>}
                    {idx < nodes.length - 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-auto"
                        onClick={() => addEdge(node.id, nodes[idx + 1].id)}
                      >
                        <Split className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {/* Show outgoing edges */}
                  {edges.filter((e) => e.from === node.id).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {edges
                        .filter((e) => e.from === node.id)
                        .map((edge) => {
                          const target = nodes.find((n) => n.id === edge.to);
                          return (
                            <Badge
                              key={`${edge.from}-${edge.to}`}
                              variant="secondary"
                              className="text-[10px] gap-1 cursor-pointer"
                              onClick={() => removeEdge(edge.from, edge.to)}
                            >
                              → {target?.label || edge.to}
                              <X className="h-2.5 w-2.5" />
                            </Badge>
                          );
                        })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Execution Plan Preview */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <Settings2 className="h-4 w-4" />
            <span>执行计划</span>
          </div>

          {showPlan && plan ? (
            <ScrollArea className="h-[320px]">
              <div className="space-y-3">
                {plan.map((stage) => (
                  <div key={stage.id} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium">
                        {stage.id + 1}
                      </div>
                      <span className="text-xs font-medium">{stage.label}</span>
                      {stage.parallel && (
                        <Badge variant="secondary" className="text-[10px]">
                          并行
                        </Badge>
                      )}
                    </div>
                    <div className="ml-8 space-y-1">
                      {stage.nodes.map((node) => (
                        <div
                          key={node.id}
                          className="text-xs text-muted-foreground flex items-center gap-1.5"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                          {node.label}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : showPlan ? (
            <div className="text-sm text-destructive">无法生成计划：DAG 包含循环依赖</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              添加节点和依赖后点击 &quot;生成执行计划&quot;
            </div>
          )}

          <Separator className="my-3" />
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>总节点数</span>
              <span className="font-medium">{nodes.length}</span>
            </div>
            <div className="flex justify-between">
              <span>总依赖数</span>
              <span className="font-medium">{edges.length}</span>
            </div>
            <div className="flex justify-between">
              <span>是否有环</span>
              <span
                className={cn(
                  'font-medium',
                  topoResult.cycle ? 'text-destructive' : 'text-green-500',
                )}
              >
                {topoResult.cycle ? '是' : '否'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
