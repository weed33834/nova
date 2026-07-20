export type AgentRole =
  | 'teacher'
  | 'assistant'
  | 'student'
  | 'tutor'
  | 'evaluator'
  | 'mentor'
  | 'facilitator'
  | 'critic'
  | 'summarizer'
  | 'researcher';

export type Permission =
  | 'speak'
  | 'whiteboard:draw'
  | 'whiteboard:erase'
  | 'whiteboard:manage'
  | 'slide:control'
  | 'slide:spotlight'
  | 'slide:laser'
  | 'quiz:create'
  | 'quiz:grade'
  | 'media:control'
  | 'discussion:moderate'
  | 'evaluate'
  | 'summarize'
  | 'manage_agents';

export type InteractionPattern = 'direct' | 'scaffold' | 'socratic' | 'collaborative';

export interface RoleConstraint {
  type: 'max_turns' | 'max_actions' | 'require_approval' | 'cooldown' | 'require_context';
  value?: number | string;
}

export interface RoleDefinition {
  role: AgentRole;
  displayName: string;
  description: string;
  permissions: Permission[];
  capabilities: string[];
  constraints: RoleConstraint[];
  interactionPattern: InteractionPattern;
  priority: number;
}

export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition> = {
  teacher: {
    role: 'teacher',
    displayName: '教师',
    description: '主导教学进程，控制课件，发起讨论，评估学生',
    permissions: [
      'speak',
      'slide:control',
      'slide:spotlight',
      'slide:laser',
      'whiteboard:draw',
      'whiteboard:erase',
      'whiteboard:manage',
      'quiz:create',
      'quiz:grade',
      'discussion:moderate',
      'media:control',
      'evaluate',
    ],
    capabilities: [
      'content_explanation',
      'slide_navigation',
      'quiz_creation',
      'discussion_lead',
      'knowledge_assessment',
    ],
    constraints: [],
    interactionPattern: 'direct',
    priority: 10,
  },
  assistant: {
    role: 'assistant',
    displayName: '助教',
    description: '辅助教学，回答学生问题，提供补充材料',
    permissions: ['speak', 'whiteboard:draw', 'whiteboard:erase', 'slide:control'],
    capabilities: ['question_answering', 'supplemental_material', 'example_provision'],
    constraints: [],
    interactionPattern: 'scaffold',
    priority: 7,
  },
  student: {
    role: 'student',
    displayName: '学生',
    description: '参与讨论，提出观点，完成练习',
    permissions: ['speak', 'whiteboard:draw', 'whiteboard:erase'],
    capabilities: ['discussion_participation', 'question_asking', 'opinion_sharing'],
    constraints: [{ type: 'max_actions', value: 5 }],
    interactionPattern: 'collaborative',
    priority: 5,
  },
  tutor: {
    role: 'tutor',
    displayName: '导师',
    description: '个性化辅导，基于学生画像提供针对性的指导',
    permissions: [
      'speak',
      'whiteboard:draw',
      'whiteboard:erase',
      'evaluate',
      'quiz:create',
      'quiz:grade',
    ],
    capabilities: [
      'personalized_guidance',
      'adaptive_explanation',
      'misconception_correction',
      'progress_tracking',
    ],
    constraints: [],
    interactionPattern: 'socratic',
    priority: 8,
  },
  evaluator: {
    role: 'evaluator',
    displayName: '评估员',
    description: '评估学生学习成果，提供评分和反馈',
    permissions: ['speak', 'evaluate', 'quiz:grade', 'summarize'],
    capabilities: ['performance_assessment', 'feedback_provision', 'skill_gap_analysis'],
    constraints: [{ type: 'require_context' }],
    interactionPattern: 'direct',
    priority: 6,
  },
  mentor: {
    role: 'mentor',
    displayName: '导师',
    description: '长期跟踪学习进度，提供策略建议和动机支持',
    permissions: ['speak', 'whiteboard:draw', 'evaluate', 'summarize'],
    capabilities: ['progress_review', 'strategy_advice', 'motivation_support', 'goal_setting'],
    constraints: [],
    interactionPattern: 'socratic',
    priority: 7,
  },
  facilitator: {
    role: 'facilitator',
    displayName: '引导员',
    description: '管理小组讨论，确保参与度，调解分歧',
    permissions: ['speak', 'discussion:moderate', 'manage_agents', 'whiteboard:manage'],
    capabilities: ['discussion_management', 'participation_balancing', 'conflict_resolution'],
    constraints: [],
    interactionPattern: 'collaborative',
    priority: 6,
  },
  critic: {
    role: 'critic',
    displayName: '评论员',
    description: '从不同角度审视观点，提出建设性批评',
    permissions: ['speak', 'whiteboard:draw'],
    capabilities: ['critical_analysis', 'alternative_perspective', 'constructive_feedback'],
    constraints: [{ type: 'max_turns', value: 3 }],
    interactionPattern: 'collaborative',
    priority: 4,
  },
  summarizer: {
    role: 'summarizer',
    displayName: '总结员',
    description: '总结讨论内容，提炼关键点，形成笔记',
    permissions: ['speak', 'summarize', 'whiteboard:draw'],
    capabilities: ['content_summarization', 'key_point_extraction', 'note_organization'],
    constraints: [{ type: 'require_context' }],
    interactionPattern: 'direct',
    priority: 3,
  },
  researcher: {
    role: 'researcher',
    displayName: '研究员',
    description: '搜索和提供额外信息、数据、案例研究',
    permissions: ['speak', 'whiteboard:draw'],
    capabilities: ['information_retrieval', 'data_provision', 'case_study_sharing'],
    constraints: [],
    interactionPattern: 'scaffold',
    priority: 4,
  },
};

export function getRoleDefinition(role: AgentRole): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}

export function hasPermission(role: AgentRole, permission: Permission): boolean {
  return ROLE_DEFINITIONS[role]?.permissions.includes(permission) ?? false;
}

export function getPermissionsForRole(role: AgentRole): Permission[] {
  return ROLE_DEFINITIONS[role]?.permissions ?? [];
}
