import { createLogger } from '@/lib/logger';
import {
  type StudentProfile,
  type KnowledgeFoundation,
  type CognitiveStyle,
  type LearningGoal,
  type ModalityPreference,
  type TimeBudget,
  type ErrorPattern,
  type LearningHistoryEntry,
  createEmptyProfile,
} from './schema';

const log = createLogger('ProfileExtractor');

type CognitiveStyleKey = NonNullable<CognitiveStyle>['primary'];
type ModalityKey = Exclude<NonNullable<ModalityPreference>['primary'], 'mixed'>;

export interface ExtractionContext {
  userMessage: string;
  assistantMessage?: string;
  previousProfile?: StudentProfile;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentContext?: string;
  courseContext?: {
    subject?: string;
    level?: string;
    outline?: string;
  };
}

export interface ExtractionResult {
  profile: StudentProfile;
  extractedFields: (keyof StudentProfile)[];
  confidence: number;
  reasoning: string;
}

const EXTRACTION_PROMPT = `你是学习画像分析专家。请从用户的对话历史中提取结构化的学习画像信息。

当前画像状态：
{{CURRENT_PROFILE}}

对话历史：
{{CONVERSATION_HISTORY}}

最新用户消息：
{{USER_MESSAGE}}

{{DOCUMENT_CONTEXT}}
{{COURSE_CONTEXT}}

请分析并提取以下 6 个维度的信息（只输出有变化或新增的字段）：

1. **knowledgeFoundation** (知识基础)：识别用户提到的专业、已掌握主题、自述水平、证据（如成绩、项目、证书）
2. **cognitiveStyle** (认知风格)：从语言中推断：视觉/听觉/读写/动觉，序列/整体，主动/反思
3. **learningGoals** (学习目标)：明确的考试、技能、项目、认证、好奇心等目标，包含时间要求
4. **modalityPreference** (模态偏好)：偏好文本/视频/音频/互动/代码/图表，以及排除项
5. **timeBudget** (时间预算)：可用总小时、每周小时、偏好时段、截止日期
6. **errorPatterns** (易错点偏好)：用户主动提到的易错点、困惑点、想复习的内容

输出格式（JSON）：
{
  "knowledgeFoundation": [...],
  "cognitiveStyle": {...},
  "learningGoals": [...],
  "modalityPreference": {...},
  "timeBudget": {...},
  "errorPatterns": [...],
  "confidence": 0.85,
  "reasoning": "基于用户提到...推断出..."
}`;

function buildPrompt(context: ExtractionContext): string {
  let prompt = EXTRACTION_PROMPT.replace(
    '{{CURRENT_PROFILE}}',
    context.previousProfile ? JSON.stringify(context.previousProfile, null, 2) : '无（新用户）',
  )
    .replace(
      '{{CONVERSATION_HISTORY}}',
      context.conversationHistory
        .slice(-10)
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
        .join('\n') || '无',
    )
    .replace('{{USER_MESSAGE}}', context.userMessage);

  if (context.documentContext) {
    prompt = prompt.replace('{{DOCUMENT_CONTEXT}}', `参考文档摘要：\n${context.documentContext}\n`);
  } else {
    prompt = prompt.replace('{{DOCUMENT_CONTEXT}}', '');
  }

  if (context.courseContext) {
    prompt = prompt.replace(
      '{{COURSE_CONTEXT}}',
      `课程上下文：\n${JSON.stringify(context.courseContext, null, 2)}\n`,
    );
  } else {
    prompt = prompt.replace('{{COURSE_CONTEXT}}', '');
  }

  return prompt;
}

export async function extractProfileFromConversation(
  context: ExtractionContext,
  llmCall: (prompt: string) => Promise<string>,
): Promise<ExtractionResult> {
  const prompt = buildPrompt(context);

  try {
    const response = await llmCall(prompt);
    const parsed = JSON.parse(response);

    const baseProfile = context.previousProfile || createEmptyProfile();
    const mergedProfile = mergePartialProfile(baseProfile, parsed);

    const extractedFields = Object.keys(parsed).filter(
      (k) => k !== 'confidence' && k !== 'reasoning',
    ) as (keyof StudentProfile)[];

    return {
      profile: mergedProfile,
      extractedFields,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || '自动提取',
    };
  } catch (error) {
    log.error('画像提取失败:', error);
    return {
      profile: context.previousProfile || createEmptyProfile(),
      extractedFields: [],
      confidence: 0,
      reasoning: `提取失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

function mergePartialProfile(
  base: StudentProfile,
  partial: Partial<StudentProfile>,
): StudentProfile {
  const merged = { ...base, updatedAt: Date.now(), version: base.version + 1 } as StudentProfile;

  if (partial.knowledgeFoundation) {
    const existing = new Map(base.knowledgeFoundation.map((kf) => [kf.domain, kf]));
    for (const kf of partial.knowledgeFoundation) {
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

  if (partial.cognitiveStyle) {
    merged.cognitiveStyle = partial.cognitiveStyle;
  }

  if (partial.learningGoals) {
    const existing = new Map(base.learningGoals.map((lg, i) => [lg.type + i, lg]));
    for (const lg of partial.learningGoals) {
      const key = lg.type + existing.size;
      existing.set(key, lg);
    }
    merged.learningGoals = Array.from(existing.values());
  }

  if (partial.modalityPreference) {
    merged.modalityPreference = partial.modalityPreference;
  }

  if (partial.timeBudget) {
    merged.timeBudget = partial.timeBudget;
  }

  if (partial.errorPatterns) {
    const existing = new Map(base.errorPatterns.map((ep) => [ep.concept, ep]));
    for (const ep of partial.errorPatterns) {
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

  if (partial.specialNeeds) {
    merged.specialNeeds = [...new Set([...base.specialNeeds, ...partial.specialNeeds])];
  }

  return merged;
}

export function inferCognitiveStyleFromText(text: string): Partial<CognitiveStyle> {
  const lower = text.toLowerCase();
  const scores: Record<CognitiveStyleKey, number> = {
    visual: 0,
    auditory: 0,
    reading_writing: 0,
    kinesthetic: 0,
    sequential: 0,
    global: 0,
    active: 0,
    reflective: 0,
  };

  const indicators: Record<CognitiveStyleKey, string[]> = {
    visual: [
      '图',
      '图表',
      '思维导图',
      '可视化',
      '看',
      '画面',
      '视频',
      '动画',
      '颜色',
      '布局',
      '结构图',
    ],
    auditory: ['听', '语音', '朗读', '播客', '音频', '讲', '说', '口头', '听力', '发音'],
    reading_writing: ['阅读', '笔记', '写', '总结', '记录', '文档', '文字', '书', '文章', '笔记本'],
    kinesthetic: [
      '实操',
      '动手',
      '练习',
      '项目',
      '代码',
      '实验',
      '搭建',
      '调试',
      '跑通',
      '交互',
      '操作',
    ],
    sequential: ['步骤', '顺序', '循序渐进', '从基础', '一步步', '先', '再', '然后', '最后'],
    global: ['整体', '大局', '框架', '全貌', '概览', '宏观', '整体性', '先看全貌'],
    active: ['讨论', '提问', '尝试', '马上', '立即', '实践', '做', '试'],
    reflective: ['思考', '反思', '消化', '沉淀', '理解', '内化', '慢', '仔细'],
  };

  for (const dim of Object.keys(indicators) as CognitiveStyleKey[]) {
    const keywords = indicators[dim];
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[dim] += 1;
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return {};

  const sorted = (Object.keys(scores) as CognitiveStyleKey[]).sort((a, b) => scores[b] - scores[a]);
  const primary = sorted[0];
  const secondary = sorted[1];

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const normalized = {} as CognitiveStyle['scores'];
  for (const key of Object.keys(scores) as CognitiveStyleKey[]) {
    normalized[key] = total > 0 ? scores[key] / total : 0;
  }

  return {
    primary,
    secondary,
    scores: normalized,
    confidence: Math.min(0.8, maxScore * 0.15),
  };
}

export function inferModalityPreferenceFromText(text: string): Partial<ModalityPreference> {
  const lower = text.toLowerCase();
  const scores: Record<ModalityKey, number> = {
    text: 0,
    video: 0,
    audio: 0,
    interactive: 0,
    code: 0,
    diagram: 0,
  };

  const indicators: Record<ModalityKey, string[]> = {
    text: ['阅读', '文档', '书', '文章', '笔记', '文字', 'pdf', '文本'],
    video: ['视频', '看', '动画', '演示', '录播', '直播', 'b站', 'youtube', '视频教程'],
    audio: ['听', '音频', '播客', '语音', '朗读', '听力', '耳机'],
    interactive: ['互动', '操作', '点击', '拖拽', '仿真', '模拟', '实验', '沙箱', '玩'],
    code: ['代码', '编程', '实现', '调试', '跑通', '项目', 'github', 'commit', '函数', '类'],
    diagram: ['图', '思维导图', '流程图', '架构图', '结构图', '关系图', '可视化', '画图'],
  };

  for (const dim of Object.keys(indicators) as ModalityKey[]) {
    const keywords = indicators[dim];
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[dim] += 1;
    }
  }

  const sorted = (Object.keys(scores) as ModalityKey[]).sort((a, b) => scores[b] - scores[a]);
  if (scores[sorted[0]] === 0) return {};

  const primary = sorted[0];
  const secondary = scores[sorted[1]] > 0 ? sorted[1] : undefined;
  const avoided = (Object.keys(scores) as ModalityKey[]).filter((key) => scores[key] === 0);

  return {
    primary,
    secondary,
    avoided,
    adaptiveness: 0.6,
  };
}

export function inferTimeBudgetFromText(text: string): Partial<TimeBudget> {
  const lower = text.toLowerCase();
  const result: Partial<TimeBudget> = {};

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(小时|hour|h)/i);
  if (hourMatch) {
    const val = parseFloat(hourMatch[1]);
    if (text.includes('周') || text.includes('week')) result.weeklyHours = val;
    else if (text.includes('总') || text.includes('total')) result.totalHoursAvailable = val;
  }

  const sessionMatch = text.match(/(\d+)\s*(分钟|min|minute)/i);
  if (sessionMatch) {
    const mins = parseInt(sessionMatch[1]);
    if (mins <= 15) result.sessionLength = 'micro';
    else if (mins <= 30) result.sessionLength = 'short';
    else if (mins <= 60) result.sessionLength = 'medium';
    else result.sessionLength = 'long';
  }

  const timeKeywords = [
    '早上',
    '上午',
    '中午',
    '下午',
    '晚上',
    '深夜',
    'morning',
    'evening',
    'night',
  ];
  result.preferredTimes = timeKeywords.filter((t) => lower.includes(t));

  return result;
}

export function inferLearningGoalsFromText(text: string): Partial<LearningGoal>[] {
  const goals: Partial<LearningGoal>[] = [];
  const lower = text.toLowerCase();

  const goalPatterns = [
    {
      type: 'exam_prep',
      keywords: ['考试', '考研', '四六级', '证书', '认证', '通过', '及格', '高分'],
    },
    {
      type: 'skill_acquisition',
      keywords: ['学会', '掌握', '技能', '实操', '项目', '作品集', '就业', '面试'],
    },
    {
      type: 'conceptual_understanding',
      keywords: ['理解', '原理', '本质', '为什么', '机制', '理论', '深度'],
    },
    {
      type: 'project_completion',
      keywords: ['完成', '做完', '交付', '上线', '发布', 'demo', '原型'],
    },
    { type: 'certification', keywords: ['证书', '认证', '资格', '执照', '通过考试'] },
    { type: 'career_transition', keywords: ['转行', '跳槽', '求职', '简历', '面试', '入职'] },
    { type: 'curiosity', keywords: ['好奇', '了解', '探索', '兴趣', '爱好', '玩'] },
    { type: 'teaching_others', keywords: ['教', '讲', '培训', '分享', '带新人', '助教'] },
  ];

  for (const gp of goalPatterns) {
    if (gp.keywords.some((k) => lower.includes(k))) {
      goals.push({
        type: gp.type as LearningGoal['type'],
        description: text.slice(0, 200),
        priority: 5,
      });
    }
  }

  return goals;
}

export function inferErrorPatternsFromText(
  text: string,
  existing: ErrorPattern[] = [],
): ErrorPattern[] {
  const patterns: ErrorPattern[] = [];
  const lower = text.toLowerCase();

  const errorKeywords = [
    '不会',
    '不懂',
    '搞不清',
    '总是错',
    '易错',
    '困惑',
    '不理解',
    '卡住',
    '忘记',
    '记不住',
    '混淆',
  ];

  if (errorKeywords.some((k) => lower.includes(k))) {
    const sentences = text
      .split(/[。！？.!?]/)
      .filter((s) => errorKeywords.some((k) => s.includes(k)));
    for (const sent of sentences.slice(0, 3)) {
      const concept = extractConcept(sent);
      if (concept && !existing.some((e) => e.concept === concept)) {
        patterns.push({
          concept,
          frequency: 1,
          lastOccurrence: Date.now(),
          misconception: sent.trim(),
        });
      }
    }
  }

  return patterns;
}

function extractConcept(text: string): string | null {
  const patterns = [
    /(?:不懂|不会|搞不清|易错|困惑|卡住)\s*([^，,。！？.!?]{2,20})/,
    /([^，,。！？.!?]{2,20})\s*(?:不懂|不会|搞不清|易错|困惑)/,
    /(?:概念|原理|机制|算法|定理|公式|模型|架构|框架|流程)\s*[：:]\s*([^，,。！？.!?]{2,20})/,
  ];

  for (const p of patterns) {
    const match = text.match(p);
    if (match && match[1]) {
      return match[1].trim().slice(0, 30);
    }
  }

  const words = text.match(/[\u4e00-\u9fa5a-zA-Z]{2,10}/g);
  return words?.[0] || null;
}

export async function* streamProfileExtraction(
  context: ExtractionContext,
  llmCall: (prompt: string) => AsyncGenerator<string>,
): AsyncGenerator<ExtractionResult> {
  const prompt = buildPrompt(context);
  let buffer = '';

  for await (const chunk of llmCall(prompt)) {
    buffer += chunk;
    try {
      const parsed = JSON.parse(buffer);
      const baseProfile = context.previousProfile || createEmptyProfile();
      const mergedProfile = mergePartialProfile(baseProfile, parsed);

      yield {
        profile: mergedProfile,
        extractedFields: Object.keys(parsed).filter(
          (k) => k !== 'confidence' && k !== 'reasoning',
        ) as (keyof StudentProfile)[],
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || '流式提取中...',
      };
    } catch {
      // 忽略不完整的 JSON
    }
  }
}
