import type {
  Modality,
  MultimodalContent,
  MultimodalRequest,
  TutoringSession,
  TutorResponse,
  TutorResponseType,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('MultimodalTutor');

const MODALITY_EFFECTIVENESS: Record<
  string,
  Array<{ conceptType: string; modalities: Modality[] }>
> = {
  math: [
    { conceptType: 'algebra', modalities: ['text', 'diagram', 'interactive'] },
    { conceptType: 'geometry', modalities: ['diagram', 'image', 'interactive'] },
    { conceptType: 'calculation', modalities: ['text', 'whiteboard', 'video'] },
  ],
  science: [
    { conceptType: 'physics', modalities: ['video', 'diagram', 'interactive'] },
    { conceptType: 'chemistry', modalities: ['video', 'image', 'text'] },
    { conceptType: 'biology', modalities: ['image', 'video', 'diagram'] },
  ],
  language: [
    { conceptType: 'reading', modalities: ['text', 'audio', 'image'] },
    { conceptType: 'writing', modalities: ['text', 'whiteboard', 'interactive'] },
    { conceptType: 'listening', modalities: ['audio', 'video', 'text'] },
  ],
};

export class MultimodalTutor {
  private sessions: Map<string, TutoringSession> = new Map();

  createSession(conceptId: string, preferredModalities: Modality[]): TutoringSession {
    const session: TutoringSession = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      conceptId,
      modalitySequence: preferredModalities,
      currentStep: 0,
      engagement: 0.5,
      understanding: 0,
    };
    this.sessions.set(session.sessionId, session);
    log.info(`[MultimodalTutor] Created session ${session.sessionId} for concept ${conceptId}`);
    return session;
  }

  selectOptimalModalities(request: MultimodalRequest, subject?: string): Modality[] {
    const avoided = new Set(request.avoidedModalities);
    const preferred = request.preferredModalities.filter((m) => !avoided.has(m));

    if (preferred.length > 0) return preferred;

    if (subject && MODALITY_EFFECTIVENESS[subject]) {
      for (const entry of MODALITY_EFFECTIVENESS[subject]) {
        const valid = entry.modalities.filter((m) => !avoided.has(m));
        if (valid.length > 0) return valid;
      }
    }

    const defaults: Modality[] = ['text', 'image', 'interactive'];
    return defaults.filter((m) => !avoided.has(m));
  }

  generateAdaptiveContent(
    request: MultimodalRequest,
    session?: TutoringSession,
  ): MultimodalContent {
    const modalities = this.selectOptimalModalities(request);
    const primary = modalities[0] ?? 'text';
    const secondary = modalities.slice(1, 3);

    let format: MultimodalContent['format'] = 'explanation';
    let content = '';

    switch (primary) {
      case 'diagram':
        format = 'visualization';
        content = `[Diagram] Visual representation of "${request.conceptLabel}" with annotated components and relationships`;
        break;
      case 'interactive':
        format = 'practice';
        content = `[Interactive] Explore "${request.conceptLabel}" through guided manipulation and immediate feedback`;
        break;
      case 'video':
        format = 'demonstration';
        content = `[Video] Step-by-step demonstration of "${request.conceptLabel}" with visual examples`;
        break;
      case 'audio':
        format = 'explanation';
        content = `[Audio] Spoken explanation of "${request.conceptLabel}" with examples`;
        break;
      default:
        format = request.difficulty > 5 ? 'explanation' : 'example';
        content = `${request.difficulty > 5 ? 'Detailed explanation' : 'Simple example'} of "${request.conceptLabel}"${request.context ? ` in context of ${request.context}` : ''}`;
    }

    return {
      primaryModality: primary,
      secondaryModalities: secondary,
      content,
      format,
      adaptivityNotes: `Content adapted for difficulty level ${request.difficulty}, primary modality: ${primary}`,
    };
  }

  getNextTutorResponse(sessionId: string, userUnderstanding?: number): TutorResponse | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    if (userUnderstanding !== undefined) {
      session.understanding = Math.min(1, Math.max(0, userUnderstanding));
    }

    const currentModality = session.modalitySequence[session.currentStep];
    const progress = session.currentStep / session.modalitySequence.length;

    let type: TutorResponseType;
    let content: string;

    if (session.understanding < 0.3) {
      type = 'explain';
      content = `Let me explain this differently using ${currentModality}`;
    } else if (session.understanding < 0.6) {
      type = 'hint';
      content = `Here's a hint to help you understand better via ${currentModality}`;
    } else if (session.understanding < 0.85) {
      type = 'question';
      content = `Can you apply what you've learned? Let's try a ${currentModality}-based exercise`;
    } else {
      type = 'encourage';
      content = "Great progress! Let's move to the next concept";
      session.currentStep = session.modalitySequence.length;
    }

    session.currentStep = Math.min(session.currentStep + 1, session.modalitySequence.length - 1);
    session.engagement = Math.min(1, session.engagement + 0.1);

    return {
      type,
      modality: currentModality,
      content,
      waitForUser: type === 'question' || type === 'hint',
    };
  }

  getSession(sessionId: string): TutoringSession | undefined {
    return this.sessions.get(sessionId);
  }
}
