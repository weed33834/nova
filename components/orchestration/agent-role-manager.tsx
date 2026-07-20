'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import {
  Pencil,
  Save,
  X,
  Brain,
  Shield,
  UserCheck,
  Users,
  BookOpen,
  MessageSquare,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import type { Permission, RoleDefinition } from '@/lib/orchestration/roles/types';
import { ROLE_DEFINITIONS } from '@/lib/orchestration/roles/types';
import { useRoleStore, getEffectiveRoles, type RoleOverride } from '@/lib/orchestration/roles/role-store';

const ROLE_ICONS: Record<string, React.ReactNode> = {
  teacher: <Brain className="h-4 w-4" />,
  assistant: <UserCheck className="h-4 w-4" />,
  student: <Users className="h-4 w-4" />,
  tutor: <BookOpen className="h-4 w-4" />,
  evaluator: <BarChart3 className="h-4 w-4" />,
  mentor: <Shield className="h-4 w-4" />,
  facilitator: <MessageSquare className="h-4 w-4" />,
};

const PERMISSION_LABELS: Record<Permission, string> = {
  speak: '发言',
  'whiteboard:draw': '白板绘制',
  'whiteboard:erase': '白板擦除',
  'whiteboard:manage': '白板管理',
  'slide:control': '幻灯片控制',
  'slide:spotlight': '聚光灯',
  'slide:laser': '激光笔',
  'quiz:create': '创建测验',
  'quiz:grade': '批改测验',
  'media:control': '媒体控制',
  'discussion:moderate': '讨论主持',
  evaluate: '评估',
  summarize: '总结',
  manage_agents: '管理智能体',
};

export function AgentRoleManager() {
  const { t } = useI18n();
  const { overrides, updateRole, resetRole, resetAll } = useRoleStore();
  const roles = getEffectiveRoles();
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RoleOverride>>({});

  const handleEdit = useCallback((roleId: string) => {
    const role = roles.find((r) => r.role === roleId);
    if (!role) return;
    setEditingRole(roleId);
    setEditForm({
      displayName: role.displayName,
      description: role.description,
      permissions: [...role.permissions],
      interactionPattern: role.interactionPattern,
      priority: role.priority,
    });
  }, [roles]);

  const handleSave = useCallback(() => {
    if (!editingRole) return;
    updateRole(editingRole, editForm);
    setEditingRole(null);
    setEditForm({});
  }, [editingRole, editForm, updateRole]);

  const handleCancel = useCallback(() => {
    setEditingRole(null);
    setEditForm({});
  }, []);

  const togglePermission = useCallback((perm: Permission) => {
    setEditForm((prev) => {
      const perms = prev.permissions ?? [];
      return {
        ...prev,
        permissions: perms.includes(perm) ? perms.filter((p) => p !== perm) : [...perms, perm],
      };
    });
  }, []);

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('settings.agentRoles.title')}</h3>
          <p className="text-sm text-muted-foreground">管理智能体角色及其权限配置</p>
        </div>
        {hasOverrides && (
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置全部
          </Button>
        )}
      </div>

      <ScrollArea className="h-[400px]">
        <div className="space-y-3 pr-4">
          {roles.map((role) => (
            <Card
              key={role.role}
              className={cn('p-4', editingRole === role.role && 'ring-2 ring-primary')}
            >
              {editingRole === role.role ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {ROLE_ICONS[role.role]}
                      <Input
                        value={editForm.displayName ?? ''}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, displayName: e.target.value }))
                        }
                        className="w-40 h-8 text-sm font-medium"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave}>
                        <Save className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={handleCancel}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">描述</Label>
                    <Input
                      value={editForm.description ?? ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      className="h-8 text-sm mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">交互模式</Label>
                    <Select
                      value={editForm.interactionPattern ?? 'direct'}
                      onValueChange={(v) =>
                        setEditForm((f) => ({
                          ...f,
                          interactionPattern: v as RoleDefinition['interactionPattern'],
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">直接教学</SelectItem>
                        <SelectItem value="scaffold">支架式</SelectItem>
                        <SelectItem value="socratic">苏格拉底式</SelectItem>
                        <SelectItem value="collaborative">协作式</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">权限 ({editForm.permissions?.length ?? 0})</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(Object.keys(PERMISSION_LABELS) as Permission[]).map((perm) => (
                        <Badge
                          key={perm}
                          variant={editForm.permissions?.includes(perm) ? 'default' : 'outline'}
                          className="cursor-pointer text-xs"
                          onClick={() => togglePermission(perm)}
                        >
                          {PERMISSION_LABELS[perm]}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">优先级</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={editForm.priority ?? 5}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, priority: parseInt(e.target.value) || 5 }))
                      }
                      className="h-8 w-20 mt-1"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/5">
                    {ROLE_ICONS[role.role] || <Users className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.displayName}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {role.role}
                      </Badge>
                      {overrides[role.role] && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-500">
                          已修改
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {role.permissions.slice(0, 5).map((perm) => (
                        <Badge key={perm} variant="outline" className="text-[10px] px-1.5 py-0">
                          {PERMISSION_LABELS[perm] || perm}
                        </Badge>
                      ))}
                      {role.permissions.length > 5 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{role.permissions.length - 5}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleEdit(role.role)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {overrides[role.role] && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => resetRole(role.role)}
                        title="重置为默认"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
