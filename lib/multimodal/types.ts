export type Modality =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'whiteboard'
  | 'interactive'
  | 'diagram';

export type ContentFormat =
  | 'explanation'
  | 'example'
  | 'practice'
  | 'visualization'
  | 'demonstration'
  | 'analogy'
  | 'story';

export interface MultimodalContent {
  primaryModality: Modality;
  secondaryModalities: Modality[];
  content: string;
  format: ContentFormat;
  mediaUrls?: string[];
  adaptivityNotes?: string;
}

export interface MultimodalRequest {
  conceptId: string;
  conceptLabel: string;
  preferredModalities: Modality[];
  avoidedModalities: Modality[];
  difficulty: number;
  context?: string;
}

export interface TutoringSession {
  sessionId: string;
  startedAt: number;
  conceptId: string;
  modalitySequence: Modality[];
  currentStep: number;
  engagement: number;
  understanding: number;
}

export type TutorResponseType =
  | 'explain'
  | 'question'
  | 'hint'
  | 'correct'
  | 'encourage'
  | 'redirect';

export interface TutorResponse {
  type: TutorResponseType;
  modality: Modality;
  content: string;
  mediaUrl?: string;
  waitForUser: boolean;
}
