import { z } from 'zod';

export const CognitiveStyleEnum = z.enum([
  'visual',
  'auditory',
  'reading_writing',
  'kinesthetic',
  'sequential',
  'global',
  'active',
  'reflective',
]);

export const PriorKnowledgeLevelEnum = z.enum([
  'novice',
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

export const LearningGoalTypeEnum = z.enum([
  'exam_prep',
  'skill_acquisition',
  'conceptual_understanding',
  'project_completion',
  'certification',
  'career_transition',
  'curiosity',
  'teaching_others',
]);

export const ModalityPreferenceEnum = z.enum([
  'text',
  'video',
  'audio',
  'interactive',
  'code',
  'diagram',
  'mixed',
]);

export const TimeBudgetEnum = z.enum(['micro', 'short', 'medium', 'long', 'unlimited']);

export const SpecialNeedEnum = z.enum([
  'dyslexia',
  'adhd',
  'visual_impairment',
  'hearing_impairment',
  'motor_impairment',
  'language_barrier',
  'anxiety',
  'none',
]);

export const KnowledgeFoundationSchema = z.object({
  domain: z.string().min(1),
  level: PriorKnowledgeLevelEnum,
  topics: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  lastUpdated: z.number().default(() => Date.now()),
});

export const CognitiveStyleSchema = z.object({
  primary: CognitiveStyleEnum,
  secondary: CognitiveStyleEnum.optional(),
  scores: z.record(CognitiveStyleEnum, z.number().min(0).max(1)).default(() => {
    const defaults = {
      visual: 0,
      auditory: 0,
      reading_writing: 0,
      kinesthetic: 0,
      sequential: 0,
      global: 0,
      active: 0,
      reflective: 0,
    };
    return defaults;
  }),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const LearningGoalSchema = z.object({
  type: LearningGoalTypeEnum,
  description: z.string().min(1),
  targetDate: z.number().optional(),
  milestones: z.array(z.string()).default([]),
  successCriteria: z.array(z.string()).default([]),
  priority: z.number().min(1).max(10).default(5),
});

export const ModalityPreferenceSchema = z.object({
  primary: ModalityPreferenceEnum,
  secondary: ModalityPreferenceEnum.optional(),
  avoided: z.array(ModalityPreferenceEnum).default([]),
  adaptiveness: z.number().min(0).max(1).default(0.5),
});

export const TimeBudgetSchema = z.object({
  totalHoursAvailable: z.number().min(0).optional(),
  weeklyHours: z.number().min(0).optional(),
  sessionLength: TimeBudgetEnum,
  preferredTimes: z.array(z.string()).default([]),
  deadline: z.number().optional(),
});

export const ErrorPatternSchema = z.object({
  concept: z.string(),
  frequency: z.number().min(0).default(0),
  lastOccurrence: z.number().optional(),
  misconception: z.string().optional(),
  remediation: z.string().optional(),
});

export const LearningHistoryEntrySchema = z.object({
  timestamp: z.number(),
  activity: z.enum([
    'session_start',
    'scene_complete',
    'quiz_attempt',
    'resource_view',
    'help_request',
    'break',
    'session_end',
  ]),
  sceneId: z.string().optional(),
  duration: z.number().optional(),
  outcome: z.enum(['success', 'partial', 'failed', 'skipped']).optional(),
  metadata: z.record(z.string(), z.unknown()).default(() => ({})),
});

export const StudentProfileSchema = z.object({
  id: z.string(),
  version: z.number().default(1),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),

  knowledgeFoundation: z.array(KnowledgeFoundationSchema).default([]),
  cognitiveStyle: CognitiveStyleSchema.optional(),
  learningGoals: z.array(LearningGoalSchema).default([]),
  modalityPreference: ModalityPreferenceSchema.optional(),
  timeBudget: TimeBudgetSchema.optional(),
  errorPatterns: z.array(ErrorPatternSchema).default([]),
  specialNeeds: z.array(SpecialNeedEnum).default(['none']),

  learningHistory: z.array(LearningHistoryEntrySchema).default([]),
  totalStudyTime: z.number().default(0),
  streakDays: z.number().default(0),
  lastActiveDate: z.number().optional(),

  metadata: z.record(z.string(), z.unknown()).default(() => ({})),
});

export type StudentProfile = z.infer<typeof StudentProfileSchema>;
export type KnowledgeFoundation = z.infer<typeof KnowledgeFoundationSchema>;
export type CognitiveStyle = z.infer<typeof CognitiveStyleSchema>;
export type LearningGoal = z.infer<typeof LearningGoalSchema>;
export type ModalityPreference = z.infer<typeof ModalityPreferenceSchema>;
export type TimeBudget = z.infer<typeof TimeBudgetSchema>;
export type ErrorPattern = z.infer<typeof ErrorPatternSchema>;
export type LearningHistoryEntry = z.infer<typeof LearningHistoryEntrySchema>;

export const PROFILE_DIMENSIONS = [
  { key: 'knowledgeFoundation', label: 'knowledgeFoundation', icon: '📚', weight: 0.25 },
  { key: 'cognitiveStyle', label: 'cognitiveStyle', icon: '🧠', weight: 0.15 },
  { key: 'learningGoals', label: 'learningGoals', icon: '🎯', weight: 0.2 },
  { key: 'modalityPreference', label: 'modalityPreference', icon: '🎨', weight: 0.15 },
  { key: 'timeBudget', label: 'timeBudget', icon: '⏱️', weight: 0.1 },
  { key: 'errorPatterns', label: 'errorPatterns', icon: '🔍', weight: 0.15 },
] as const;

export function getDimensionLabel(key: string): string {
  const dim = PROFILE_DIMENSIONS.find((d) => d.key === key);
  return dim?.label || key;
}

export function getDimensionIcon(key: string): string {
  const dim = PROFILE_DIMENSIONS.find((d) => d.key === key);
  return dim?.icon || '📊';
}

export function getDimensionWeight(key: string): number {
  const dim = PROFILE_DIMENSIONS.find((d) => d.key === key);
  return dim?.weight || 0;
}

export function createEmptyProfile(id?: string): StudentProfile {
  return {
    id: id || `profile_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    knowledgeFoundation: [],
    cognitiveStyle: undefined,
    learningGoals: [],
    modalityPreference: undefined,
    timeBudget: undefined,
    errorPatterns: [],
    specialNeeds: ['none'],
    learningHistory: [],
    totalStudyTime: 0,
    streakDays: 0,
    lastActiveDate: undefined,
    metadata: {},
  };
}

export function calculateProfileCompleteness(profile: StudentProfile): number {
  let score = 0;
  let totalWeight = 0;

  for (const dim of PROFILE_DIMENSIONS) {
    const weight = dim.weight;
    totalWeight += weight;

    let dimScore = 0;
    switch (dim.key) {
      case 'knowledgeFoundation':
        dimScore =
          profile.knowledgeFoundation.length > 0
            ? Math.min(1, profile.knowledgeFoundation.length / 5)
            : 0;
        break;
      case 'cognitiveStyle':
        dimScore = profile.cognitiveStyle ? 1 : 0;
        break;
      case 'learningGoals':
        dimScore =
          profile.learningGoals.length > 0 ? Math.min(1, profile.learningGoals.length / 3) : 0;
        break;
      case 'modalityPreference':
        dimScore = profile.modalityPreference ? 1 : 0;
        break;
      case 'timeBudget':
        dimScore = profile.timeBudget ? 1 : 0;
        break;
      case 'errorPatterns':
        dimScore = profile.errorPatterns.length > 0 ? 0.5 : 0;
        break;
    }
    score += dimScore * weight;
  }

  return Math.round(score * 100);
}

export function mergeProfiles(
  base: StudentProfile,
  incoming: Partial<StudentProfile>,
): StudentProfile {
  const merged = {
    ...base,
    ...incoming,
    updatedAt: Date.now(),
    version: base.version + 1,
  } as StudentProfile;

  if (incoming.knowledgeFoundation) {
    const existing = new Map(base.knowledgeFoundation.map((kf) => [kf.domain, kf]));
    for (const kf of incoming.knowledgeFoundation) {
      if (existing.has(kf.domain)) {
        const ex = existing.get(kf.domain)!;
        existing.set(kf.domain, {
          ...ex,
          level: kf.level,
          topics: [...new Set([...ex.topics, ...kf.topics])],
          evidence: [...new Set([...ex.evidence, ...kf.evidence])],
          confidence: Math.max(ex.confidence, kf.confidence),
          lastUpdated: Date.now(),
        });
      } else {
        existing.set(kf.domain, { ...kf, lastUpdated: Date.now() });
      }
    }
    merged.knowledgeFoundation = Array.from(existing.values());
  }

  if (incoming.learningGoals) {
    const existing = new Map(base.learningGoals.map((lg, i) => [lg.type + i, lg]));
    for (const lg of incoming.learningGoals) {
      const key = lg.type + (existing.size > 0 ? existing.size : 0);
      existing.set(key, lg);
    }
    merged.learningGoals = Array.from(existing.values());
  }

  if (incoming.errorPatterns) {
    const existing = new Map(base.errorPatterns.map((ep) => [ep.concept, ep]));
    for (const ep of incoming.errorPatterns) {
      if (existing.has(ep.concept)) {
        const ex = existing.get(ep.concept)!;
        existing.set(ep.concept, {
          ...ex,
          frequency: ex.frequency + ep.frequency,
          lastOccurrence: ep.lastOccurrence || ex.lastOccurrence,
          misconception: ep.misconception || ex.misconception,
          remediation: ep.remediation || ex.remediation,
        });
      } else {
        existing.set(ep.concept, ep);
      }
    }
    merged.errorPatterns = Array.from(existing.values());
  }

  if (incoming.learningHistory) {
    merged.learningHistory = [...base.learningHistory, ...incoming.learningHistory].slice(-500);
  }

  return StudentProfileSchema.parse(merged);
}
