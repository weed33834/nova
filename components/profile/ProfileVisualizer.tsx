'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Brain,
  Target,
  Palette,
  Clock,
  AlertTriangle,
  Zap,
  ChevronRight,
  ChevronLeft,
  Edit,
  Save,
  X,
  Check,
  Trash2,
  Plus,
  BarChart3,
  Eye,
  EyeOff,
  Download,
  Upload,
  RotateCcw,
  GraduationCap,
  Lightbulb,
  Video,
  Music,
  Code2,
  MousePointer2,
  Share2,
  Settings,
  HelpCircle,
  AlertCircle,
  Users,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { useProfileStore, useProfileActions } from '@/lib/store/profile';
import type {
  StudentProfile,
  KnowledgeFoundation,
  LearningGoal,
  ErrorPattern,
  PROFILE_DIMENSIONS,
} from '@/lib/profile/schema';

const DIMENSION_CONFIG = [
  { key: 'knowledgeFoundation', label: '知识基础', icon: BookOpen, color: 'blue', weight: 0.25 },
  { key: 'cognitiveStyle', label: '认知风格', icon: Brain, color: 'purple', weight: 0.15 },
  { key: 'learningGoals', label: '学习目标', icon: Target, color: 'amber', weight: 0.2 },
  { key: 'modalityPreference', label: '模态偏好', icon: Palette, color: 'pink', weight: 0.15 },
  { key: 'timeBudget', label: '时间预算', icon: Clock, color: 'green', weight: 0.1 },
  { key: 'errorPatterns', label: '易错点', icon: AlertTriangle, color: 'red', weight: 0.15 },
] as const;

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  pink: 'bg-pink-500',
  green: 'bg-green-500',
  red: 'bg-red-500',
};

const COGNITIVE_STYLES = [
  { value: 'visual', label: '视觉型', desc: '偏好图表、图像、空间理解' },
  { value: 'auditory', label: '听觉型', desc: '偏好语音、讲解、讨论' },
  { value: 'reading_writing', label: '读写型', desc: '偏好文本、笔记、阅读' },
  { value: 'kinesthetic', label: '动觉型', desc: '偏好实操、动手、体验' },
  { value: 'sequential', label: '序列型', desc: '偏好循序渐进、逻辑链条' },
  { value: 'global', label: '整体型', desc: '偏好宏观框架、整体把握' },
  { value: 'active', label: '主动型', desc: '偏好尝试、讨论、即时应用' },
  { value: 'reflective', label: '反思型', desc: '偏好思考、消化、内化理解' },
];

const LEARNING_GOAL_TYPES = [
  { value: 'exam_prep', label: '考试备考', icon: GraduationCap },
  { value: 'skill_acquisition', label: '技能习得', icon: Lightbulb },
  { value: 'conceptual_understanding', label: '概念理解', icon: Brain },
  { value: 'project_completion', label: '项目完成', icon: Code2 },
  { value: 'certification', label: '认证考试', icon: Trophy },
  { value: 'career_transition', label: '职业转型', icon: Briefcase },
  { value: 'curiosity', label: '好奇探索', icon: Lightbulb },
  { value: 'teaching_others', label: '教学他人', icon: Users },
];

const MODALITY_TYPES = [
  { value: 'text', label: '文本阅读', icon: FileText },
  { value: 'video', label: '视频观看', icon: Video },
  { value: 'audio', label: '音频收听', icon: Music },
  { value: 'interactive', label: '互动操作', icon: MousePointer2 },
  { value: 'code', label: '代码实操', icon: Code2 },
  { value: 'diagram', label: '图表图解', icon: BarChart3 },
];

const TIME_BUDGET_OPTIONS = [
  { value: 'micro', label: '微学习 (≤15min)', desc: '碎片时间' },
  { value: 'short', label: '短时段 (15-30min)', desc: '通勤/休息' },
  { value: 'medium', label: '中时段 (30-60min)', desc: '专注学习' },
  { value: 'long', label: '长时段 (1-2h)', desc: '深度钻研' },
  { value: 'unlimited', label: '不限时长', desc: '全天候' },
];

const PRIOR_KNOWLEDGE_LEVELS = [
  { value: 'novice', label: '零基础', desc: '完全不懂' },
  { value: 'beginner', label: '入门', desc: '了解基本概念' },
  { value: 'intermediate', label: '进阶', desc: '能独立完成基础任务' },
  { value: 'advanced', label: '高级', desc: '能解决复杂问题' },
  { value: 'expert', label: '专家', desc: '可教学他人、创新' },
];

const SPECIAL_NEEDS = [
  { value: 'none', label: '无特殊需求' },
  { value: 'dyslexia', label: '阅读障碍' },
  { value: 'adhd', label: '注意力缺陷' },
  { value: 'visual_impairment', label: '视力障碍' },
  { value: 'hearing_impairment', label: '听力障碍' },
  { value: 'motor_impairment', label: '运动障碍' },
  { value: 'language_barrier', label: '语言障碍' },
  { value: 'anxiety', label: '学习焦虑' },
] as const satisfies ReadonlyArray<{
  value: StudentProfile['specialNeeds'][number];
  label: string;
}>;

import { FileText, Briefcase } from 'lucide-react';

interface ProfileVisualizerProps {
  profile?: StudentProfile;
  mode?: 'view' | 'edit' | 'wizard';
  onComplete?: (profile: StudentProfile) => void;
  onCancel?: () => void;
  showCompleteness?: boolean;
  className?: string;
}

export function ProfileVisualizer({
  profile: propProfile,
  mode = 'view',
  onComplete,
  onCancel,
  showCompleteness = true,
  className,
}: ProfileVisualizerProps) {
  const { t } = useI18n();
  const storeProfile = useProfileStore((state) => state.profile);
  const actions = useProfileActions();
  const profile = propProfile || storeProfile;

  const [localProfile, setLocalProfile] = useState<StudentProfile>(profile);
  const [activeTab, setActiveTab] = useState<string>(DIMENSION_CONFIG[0].key);
  const [editingDimension, setEditingDimension] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  const completeness = calculateCompleteness(localProfile);
  const dimensionScores = calculateDimensionScores(localProfile);

  function calculateCompleteness(p: StudentProfile): number {
    let score = 0,
      totalWeight = 0;
    for (const dim of DIMENSION_CONFIG) {
      totalWeight += dim.weight;
      let dimScore = 0;
      switch (dim.key) {
        case 'knowledgeFoundation':
          dimScore =
            p.knowledgeFoundation.length > 0 ? Math.min(1, p.knowledgeFoundation.length / 5) : 0;
          break;
        case 'cognitiveStyle':
          dimScore = p.cognitiveStyle ? 1 : 0;
          break;
        case 'learningGoals':
          dimScore = p.learningGoals.length > 0 ? Math.min(1, p.learningGoals.length / 3) : 0;
          break;
        case 'modalityPreference':
          dimScore = p.modalityPreference ? 1 : 0;
          break;
        case 'timeBudget':
          dimScore = p.timeBudget ? 1 : 0;
          break;
        case 'errorPatterns':
          dimScore = p.errorPatterns.length > 0 ? 0.5 : 0;
          break;
      }
      score += dimScore * dim.weight;
    }
    return Math.round(score * 100);
  }

  function calculateDimensionScores(p: StudentProfile) {
    const scores: Record<string, number> = {};
    for (const dim of DIMENSION_CONFIG) {
      let dimScore = 0;
      switch (dim.key) {
        case 'knowledgeFoundation':
          dimScore =
            p.knowledgeFoundation.length > 0 ? Math.min(1, p.knowledgeFoundation.length / 5) : 0;
          break;
        case 'cognitiveStyle':
          dimScore = p.cognitiveStyle ? 1 : 0;
          break;
        case 'learningGoals':
          dimScore = p.learningGoals.length > 0 ? Math.min(1, p.learningGoals.length / 3) : 0;
          break;
        case 'modalityPreference':
          dimScore = p.modalityPreference ? 1 : 0;
          break;
        case 'timeBudget':
          dimScore = p.timeBudget ? 1 : 0;
          break;
        case 'errorPatterns':
          dimScore = p.errorPatterns.length > 0 ? 0.5 : 0;
          break;
      }
      scores[dim.key] = Math.round(dimScore * 100);
    }
    return scores;
  }

  function handleSave() {
    actions.setProfile(localProfile);
    onComplete?.(localProfile);
  }

  function handleCancel() {
    setLocalProfile(profile);
    setEditingDimension(null);
    onCancel?.();
  }

  function handleDimensionChange(
    key: keyof StudentProfile,
    value: StudentProfile[keyof StudentProfile],
  ) {
    setLocalProfile((prev) => ({
      ...prev,
      [key]: value,
      updatedAt: Date.now(),
      version: prev.version + 1,
    }));
  }

  function handleAddKnowledgeFoundation() {
    setEditingDimension('knowledgeFoundation');
  }

  function renderKnowledgeFoundation() {
    const kf = localProfile.knowledgeFoundation;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t('profile.knowledgeFoundation')}</h3>
          {mode === 'edit' && (
            <Button size="sm" onClick={handleAddKnowledgeFoundation} className="gap-1">
              <Plus className="size-3.5" />
              {t('profile.addDomain')}
            </Button>
          )}
        </div>
        {kf.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noKnowledgeYet') : t('profile.noKnowledgeView')}
            {mode === 'edit' && (
              <Button className="mt-2" size="sm" onClick={handleAddKnowledgeFoundation}>
                {t('profile.addFirstDomain')}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kf.map((item, idx) => (
              <motion.div
                key={item.domain}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  'p-4 rounded-xl border transition-all',
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
                  mode === 'edit' &&
                    'hover:border-pink-300 dark:hover:border-pink-700 hover:shadow-md',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{item.domain}</span>
                      <Badge variant="outline" className="text-xs">
                        {t(`profile.level.${item.level}`)}
                      </Badge>
                      {item.confidence < 0.7 && (
                        <Badge variant="secondary" className="text-xs">
                          {t('profile.lowConfidence')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('profile.confidence')}: {Math.round(item.confidence * 100)}%
                    </div>
                  </div>
                  {mode === 'edit' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => actions.removeKnowledgeFoundation(item.domain)}
                    >
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
                {item.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {item.topics.slice(0, 5).map((topic) => (
                      <Badge key={topic} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                    {item.topics.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{item.topics.length - 5}
                      </Badge>
                    )}
                  </div>
                )}
                {item.evidence.length > 0 && (
                  <div className="text-xs text-muted-foreground/70">
                    {t('profile.evidence')}: {item.evidence.slice(0, 2).join(', ')}
                    {item.evidence.length > 2 && '...'}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderCognitiveStyle() {
    const cs = localProfile.cognitiveStyle;
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t('profile.cognitiveStyle')}</h3>
        {cs ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="default" className="text-sm px-3 py-1.5">
                <span className="capitalize">{t(`profile.cognitiveStyle.${cs.primary}`)}</span>
              </Badge>
              {cs.secondary && (
                <Badge variant="secondary" className="text-sm px-3 py-1.5">
                  {t('profile.secondary')}: {t(`profile.cognitiveStyle.${cs.secondary}`)}
                </Badge>
              )}
              <div className="flex-1" />
              <div className="text-sm text-muted-foreground">
                {t('profile.confidence')}: {Math.round((cs.confidence || 0.5) * 100)}%
              </div>
            </div>
            {cs.scores && Object.keys(cs.scores).length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('profile.styleScores')}</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(cs.scores).map(([style, score]) => (
                    <div key={style} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="capitalize">{t(`profile.cognitiveStyle.${style}`)}</span>
                        <span className="font-mono text-primary">{Math.round(score * 100)}%</span>
                      </div>
                      <Progress value={Math.round(score * 100)} className="h-1.5" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noCognitiveStyleYet') : t('profile.noCognitiveStyleView')}
          </div>
        )}
      </div>
    );
  }

  function renderLearningGoals() {
    const goals = localProfile.learningGoals;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t('profile.learningGoals')}</h3>
          {mode === 'edit' && (
            <Button
              size="sm"
              onClick={() => setEditingDimension('learningGoals')}
              className="gap-1"
            >
              <Plus className="size-3.5" />
              {t('profile.addGoal')}
            </Button>
          )}
        </div>
        {goals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noGoalsYet') : t('profile.noGoalsView')}
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal, idx) => (
              <motion.div
                key={goal.type + idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  'p-4 rounded-xl border flex items-center gap-4',
                  'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
                )}
              >
                {(() => {
                  const GoalType = LEARNING_GOAL_TYPES.find((g) => g.value === goal.type)?.icon;
                  return GoalType ? (
                    <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <GoalType className="size-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  ) : (
                    <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30" />
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{t(`profile.goalType.${goal.type}`)}</span>
                    <Badge variant="outline" className="text-xs">
                      {t('profile.priority')}: {goal.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{goal.description}</p>
                  {goal.targetDate && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('profile.targetDate')}: {new Date(goal.targetDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {mode === 'edit' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => actions.removeLearningGoal(idx)}
                  >
                    <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderModalityPreference() {
    const mp = localProfile.modalityPreference;
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t('profile.modalityPreference')}</h3>
        {mp ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="default" className="text-sm px-3 py-1.5">
                {t(`profile.modality.${mp.primary}`)}
              </Badge>
              {mp.secondary && (
                <Badge variant="secondary" className="text-sm px-3 py-1.5">
                  {t('profile.secondary')}: {t(`profile.modality.${mp.secondary}`)}
                </Badge>
              )}
              {mp.avoided.length > 0 && (
                <Badge variant="destructive" className="text-sm px-3 py-1.5">
                  {t('profile.avoided')}:{' '}
                  {mp.avoided.map((a) => t(`profile.modality.${a}`)).join(', ')}
                </Badge>
              )}
              <div className="flex-1" />
              <div className="text-sm text-muted-foreground">
                {t('profile.adaptiveness')}: {Math.round((mp.adaptiveness || 0.5) * 100)}%
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {MODALITY_TYPES.map((mt) => (
                <div key={mt.value} className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
                  <mt.icon className="size-5 text-muted-foreground" />
                  <span className="text-sm">{t(`profile.modality.${mt.value}`)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noModalityYet') : t('profile.noModalityView')}
          </div>
        )}
      </div>
    );
  }

  function renderTimeBudget() {
    const tb = localProfile.timeBudget;
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t('profile.timeBudget')}</h3>
        {tb ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <div className="text-sm text-muted-foreground mb-1">{t('profile.sessionLength')}</div>
              <div className="font-medium capitalize">
                {t(`profile.sessionLength.${tb.sessionLength}`)}
              </div>
            </div>
            {tb.weeklyHours && (
              <div className="p-4 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <div className="text-sm text-muted-foreground mb-1">{t('profile.weeklyHours')}</div>
                <div className="font-medium">
                  {tb.weeklyHours} {t('profile.hours')}
                </div>
              </div>
            )}
            {tb.totalHoursAvailable && (
              <div className="p-4 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <div className="text-sm text-muted-foreground mb-1">{t('profile.totalHours')}</div>
                <div className="font-medium">
                  {tb.totalHoursAvailable} {t('profile.hours')}
                </div>
              </div>
            )}
            {tb.deadline && (
              <div className="p-4 rounded-xl border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <div className="text-sm text-muted-foreground mb-1">{t('profile.deadline')}</div>
                <div className="font-medium">{new Date(tb.deadline).toLocaleDateString()}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noTimeBudgetYet') : t('profile.noTimeBudgetView')}
          </div>
        )}
      </div>
    );
  }

  function renderErrorPatterns() {
    const eps = localProfile.errorPatterns;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t('profile.errorPatterns')}</h3>
          {mode === 'edit' && eps.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => actions.resetProfile()}>
              {t('profile.clearAll')}
            </Button>
          )}
        </div>
        {eps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {mode === 'edit' ? t('profile.noErrorPatternsYet') : t('profile.noErrorPatternsView')}
          </div>
        ) : (
          <div className="space-y-2">
            {eps.map((ep, idx) => (
              <motion.div
                key={ep.concept + idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl border bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{ep.concept}</span>
                      <Badge variant="secondary" className="text-xs">
                        {t('profile.frequency')}: {ep.frequency}
                      </Badge>
                    </div>
                    {ep.misconception && (
                      <p className="text-sm text-muted-foreground">{ep.misconception}</p>
                    )}
                    {ep.remediation && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                        {t('profile.remediation')}: {ep.remediation}
                      </p>
                    )}
                  </div>
                  {mode === 'edit' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const updated = [...eps];
                        updated.splice(idx, 1);
                        setLocalProfile((prev) => ({ ...prev, errorPatterns: updated }));
                      }}
                    >
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSpecialNeeds() {
    return (
      <div className="space-y-4">
        <h3 className="font-medium">{t('profile.specialNeeds')}</h3>
        <div className="flex flex-wrap gap-2">
          {SPECIAL_NEEDS.map((sn) => (
            <Badge
              key={sn.value}
              variant={localProfile.specialNeeds.includes(sn.value) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => {
                if (mode !== 'edit') return;
                const updated = localProfile.specialNeeds.includes(sn.value)
                  ? localProfile.specialNeeds.filter((s) => s !== sn.value)
                  : [...localProfile.specialNeeds, sn.value];
                setLocalProfile((prev) => ({ ...prev, specialNeeds: updated }));
              }}
            >
              {sn.label}
            </Badge>
          ))}
        </div>
      </div>
    );
  }

  const renderDimension = (dimKey: string) => {
    switch (dimKey) {
      case 'knowledgeFoundation':
        return renderKnowledgeFoundation();
      case 'cognitiveStyle':
        return renderCognitiveStyle();
      case 'learningGoals':
        return renderLearningGoals();
      case 'modalityPreference':
        return renderModalityPreference();
      case 'timeBudget':
        return renderTimeBudget();
      case 'errorPatterns':
        return renderErrorPatterns();
      default:
        return null;
    }
  };

  if (mode === 'wizard') {
    return (
      <div className={cn('w-full max-w-3xl mx-auto', className)}>
        <div className="mb-6">
          <Progress value={completeness} className="h-2" />
          <div className="flex justify-between text-sm text-muted-foreground mt-1">
            <span>
              {t('profile.completeness')}: {completeness}%
            </span>
            <span>
              {t('profile.step')}: {activeTab + 1} / {DIMENSION_CONFIG.length}
            </span>
          </div>
        </div>
        <Card className="p-6">
          {(() => {
            const currentIdx = DIMENSION_CONFIG.findIndex((d) => d.key === activeTab);
            const config = DIMENSION_CONFIG[currentIdx >= 0 ? currentIdx : 0];
            const IconComponent = config.icon;
            const color = config.color;
            const label = config.label;
            return (
              <div className="text-center mb-6">
                <IconComponent
                  className={`size-10 mx-auto mb-3 ${COLOR_MAP[color]}/20 text-${color}-600 dark:text-${color}-400`}
                />
                <h2 className="text-xl font-bold">{t(`profile.${label}`)}</h2>
                <p className="text-muted-foreground mt-1">{t(`profile.${label}Desc`)}</p>
              </div>
            );
          })()}
          <div className="mb-6">
            {renderDimension(
              DIMENSION_CONFIG.find((d) => d.key === activeTab)?.key || DIMENSION_CONFIG[0].key,
            )}
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                const currentIdx = DIMENSION_CONFIG.findIndex((d) => d.key === activeTab);
                if (currentIdx > 0) {
                  setActiveTab(DIMENSION_CONFIG[currentIdx - 1].key);
                }
              }}
              disabled={activeTab === DIMENSION_CONFIG[0].key}
            >
              <ChevronLeft className="size-4 mr-1" />
              {t('profile.prev')}
            </Button>
            <div className="flex gap-2">
              {activeTab === DIMENSION_CONFIG[DIMENSION_CONFIG.length - 1].key ? (
                <Button onClick={handleSave} className="gap-2" disabled={completeness < 60}>
                  <Check className="size-4" />
                  {t('profile.complete')}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    const currentIdx = DIMENSION_CONFIG.findIndex((d) => d.key === activeTab);
                    if (currentIdx < DIMENSION_CONFIG.length - 1) {
                      setActiveTab(DIMENSION_CONFIG[currentIdx + 1].key);
                    }
                  }}
                  className="gap-2"
                  disabled={dimensionScores[activeTab] === 0}
                >
                  {t('profile.next')}
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)}>
      {showCompleteness && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-amber-500/10 border border-pink-200/50 dark:border-pink-800/50"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{t('profile.completeness')}</span>
            <span className="font-bold text-pink-600 dark:text-pink-400">{completeness}%</span>
          </div>
          <Progress value={completeness} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            {DIMENSION_CONFIG.map((dim) => {
              const IconComp = dim.icon;
              return (
                <span
                  key={dim.key}
                  className={cn(
                    'px-2 py-0.5 rounded flex items-center gap-1',
                    dimensionScores[dim.key] > 0
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500',
                  )}
                >
                  <IconComp className="size-3" /> {dimensionScores[dim.key]}%
                </span>
              );
            })}
          </div>
        </motion.div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 gap-1 mb-4">
          {DIMENSION_CONFIG.map((dim, idx) => (
            <TabsTrigger
              key={dim.key}
              value={dim.key}
              className={cn(
                'relative py-3 text-sm font-medium',
                'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
                'data-[state=active]:shadow-sm',
              )}
            >
              <div className="flex flex-col items-center gap-1">
                <dim.icon className="size-5" />
                <span>{dim.label}</span>
                {dimensionScores[dim.key] > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-green-500 text-white text-[9px] font-bold flex items-center justify-center">
                    ✓
                  </span>
                )}
              </div>
            </TabsTrigger>
          ))}
        </TabsList>

        <AnimatePresence mode="wait">
          {DIMENSION_CONFIG.map((dim) => (
            <TabsContent
              key={dim.key}
              value={dim.key}
              className="pt-4 animate-in fade-in-0 duration-200"
            >
              <Card className="p-6">{renderDimension(dim.key)}</Card>
            </TabsContent>
          ))}
        </AnimatePresence>
      </Tabs>

      {mode === 'edit' && (
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={handleCancel}>
            <X className="size-4 mr-1" />
            {t('profile.cancel')}
          </Button>
          <Button onClick={handleSave} className="gap-2" disabled={completeness < 40}>
            <Save className="size-4" />
            {t('profile.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileDimensionEditor({
  dimension,
  profile,
  onChange,
}: {
  dimension: (typeof DIMENSION_CONFIG)[0];
  profile: StudentProfile;
  onChange: (updates: Partial<StudentProfile>) => void;
}) {
  // 具体的编辑器实现...
  return <div className="p-4">编辑器开发中...</div>;
}
