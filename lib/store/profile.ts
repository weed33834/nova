import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createLogger } from '@/lib/logger';
import type { StudentProfile } from '@/lib/profile/schema';
import { createEmptyProfile } from '@/lib/profile/schema';

const log = createLogger('ProfileStore');

const STORAGE_KEY = 'nova-student-profile';
const STORAGE_VERSION = 1;

interface ProfileState {
  profile: StudentProfile;
  isLoaded: boolean;
  isDirty: boolean;
  lastSync: number | null;

  setProfile: (profile: StudentProfile) => void;
  mergeProfile: (partial: Partial<StudentProfile>) => void;
  updateField: <K extends keyof StudentProfile>(field: K, value: StudentProfile[K]) => void;
  addKnowledgeFoundation: (
    kf: Omit<StudentProfile['knowledgeFoundation'][0], 'lastUpdated'>,
  ) => void;
  updateKnowledgeFoundation: (
    domain: string,
    updates: Partial<StudentProfile['knowledgeFoundation'][0]>,
  ) => void;
  removeKnowledgeFoundation: (domain: string) => void;
  addLearningGoal: (
    goal: Omit<StudentProfile['learningGoals'][0], 'priority'> & { priority?: number },
  ) => void;
  updateLearningGoal: (index: number, updates: Partial<StudentProfile['learningGoals'][0]>) => void;
  removeLearningGoal: (index: number) => void;
  addErrorPattern: (ep: Omit<StudentProfile['errorPatterns'][0], 'lastOccurrence'>) => void;
  recordLearningActivity: (entry: Omit<StudentProfile['learningHistory'][0], 'timestamp'>) => void;
  resetProfile: () => void;
  exportProfile: () => string;
  importProfile: (json: string) => boolean;
  markSynced: () => void;
}

const DEFAULT_PROFILE = createEmptyProfile();

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_PROFILE,
      isLoaded: false,
      isDirty: false,
      lastSync: null,

      setProfile: (profile) => {
        log.info('设置完整画像:', profile.id);
        set({ profile, isLoaded: true, isDirty: true });
      },

      mergeProfile: (partial) => {
        const { profile } = get();
        const merged = {
          ...profile,
          ...partial,
          updatedAt: Date.now(),
          version: profile.version + 1,
        } as StudentProfile;

        if (partial.knowledgeFoundation) {
          const existing = new Map(profile.knowledgeFoundation.map((kf) => [kf.domain, kf]));
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

        if (partial.learningGoals) {
          const existing = new Map(profile.learningGoals.map((lg, i) => [lg.type + i, lg]));
          for (const lg of partial.learningGoals) {
            const key = lg.type + existing.size;
            existing.set(key, lg);
          }
          merged.learningGoals = Array.from(existing.values());
        }

        if (partial.errorPatterns) {
          const existing = new Map(profile.errorPatterns.map((ep) => [ep.concept, ep]));
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
          merged.specialNeeds = [...new Set([...profile.specialNeeds, ...partial.specialNeeds])];
        }

        if (partial.learningHistory) {
          merged.learningHistory = [...profile.learningHistory, ...partial.learningHistory].slice(
            -500,
          );
        }

        set({ profile: merged, isDirty: true });
      },

      updateField: <K extends keyof StudentProfile>(field: K, value: StudentProfile[K]) => {
        const { profile } = get();
        const updated = {
          ...profile,
          [field]: value,
          updatedAt: Date.now(),
          version: profile.version + 1,
        } as StudentProfile;
        set({ profile: updated, isDirty: true });
      },

      addKnowledgeFoundation: (kf) => {
        const { profile } = get();
        const existing = profile.knowledgeFoundation.findIndex((f) => f.domain === kf.domain);
        const newKf = { ...kf, lastUpdated: Date.now() };
        let updated: StudentProfile['knowledgeFoundation'];

        if (existing >= 0) {
          updated = profile.knowledgeFoundation.map((f, i) =>
            i === existing
              ? {
                  ...f,
                  ...newKf,
                  topics: [...new Set([...f.topics, ...newKf.topics])],
                  evidence: [...new Set([...f.evidence, ...newKf.evidence])],
                  confidence: Math.max(f.confidence, newKf.confidence),
                  lastUpdated: Date.now(),
                }
              : f,
          );
        } else {
          updated = [...profile.knowledgeFoundation, newKf];
        }

        set({
          profile: {
            ...profile,
            knowledgeFoundation: updated,
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      updateKnowledgeFoundation: (domain, updates) => {
        const { profile } = get();
        const updated = profile.knowledgeFoundation.map((f) =>
          f.domain === domain ? { ...f, ...updates, lastUpdated: Date.now() } : f,
        );
        set({
          profile: {
            ...profile,
            knowledgeFoundation: updated,
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      removeKnowledgeFoundation: (domain) => {
        const { profile } = get();
        set({
          profile: {
            ...profile,
            knowledgeFoundation: profile.knowledgeFoundation.filter((f) => f.domain !== domain),
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      addLearningGoal: (goal) => {
        const { profile } = get();
        const newGoal = {
          ...goal,
          priority: goal.priority ?? 5,
        } as StudentProfile['learningGoals'][0];
        set({
          profile: {
            ...profile,
            learningGoals: [...profile.learningGoals, newGoal],
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      updateLearningGoal: (index, updates) => {
        const { profile } = get();
        if (index < 0 || index >= profile.learningGoals.length) return;
        const updated = [...profile.learningGoals];
        updated[index] = { ...updated[index], ...updates };
        set({
          profile: {
            ...profile,
            learningGoals: updated,
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      removeLearningGoal: (index) => {
        const { profile } = get();
        if (index < 0 || index >= profile.learningGoals.length) return;
        const updated = profile.learningGoals.filter((_, i) => i !== index);
        set({
          profile: {
            ...profile,
            learningGoals: updated,
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      addErrorPattern: (ep) => {
        const { profile } = get();
        const existing = profile.errorPatterns.findIndex((e) => e.concept === ep.concept);
        const newEp = { ...ep, lastOccurrence: Date.now() } as StudentProfile['errorPatterns'][0];
        let updated: StudentProfile['errorPatterns'];

        if (existing >= 0) {
          updated = profile.errorPatterns.map((e, i) =>
            i === existing
              ? {
                  ...e,
                  frequency: e.frequency + 1,
                  lastOccurrence: Date.now(),
                  misconception: ep.misconception || e.misconception,
                  remediation: ep.remediation || e.remediation,
                }
              : e,
          );
        } else {
          updated = [...profile.errorPatterns, newEp];
        }

        set({
          profile: {
            ...profile,
            errorPatterns: updated,
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      recordLearningActivity: (entry) => {
        const { profile } = get();
        const newEntry = {
          ...entry,
          timestamp: Date.now(),
        } as StudentProfile['learningHistory'][0];
        const updatedHistory = [...profile.learningHistory, newEntry].slice(-500);

        let totalStudyTime = profile.totalStudyTime;
        let streakDays = profile.streakDays;
        const lastActive = profile.lastActiveDate;

        if (entry.activity === 'session_start' || entry.activity === 'session_end') {
          if (entry.duration) totalStudyTime += entry.duration;
        }

        const today = new Date().toDateString();
        const lastActiveDay = lastActive ? new Date(lastActive).toDateString() : null;
        if (lastActiveDay !== today) {
          if (lastActiveDay === new Date(Date.now() - 86400000).toDateString()) {
            streakDays += 1;
          } else if (!lastActiveDay) {
            streakDays = 1;
          } else {
            streakDays = 1;
          }
        }

        set({
          profile: {
            ...profile,
            learningHistory: updatedHistory,
            totalStudyTime,
            streakDays,
            lastActiveDate: Date.now(),
            updatedAt: Date.now(),
            version: profile.version + 1,
          },
          isDirty: true,
        });
      },

      resetProfile: () => {
        log.info('重置画像');
        set({ profile: createEmptyProfile(), isDirty: true });
      },

      exportProfile: () => {
        const { profile } = get();
        return JSON.stringify(profile, null, 2);
      },

      importProfile: (json) => {
        try {
          const parsed = JSON.parse(json);
          const requiredFields = ['id', 'version', 'createdAt', 'updatedAt'];
          if (!requiredFields.every((f) => f in parsed)) {
            log.error('导入失败: 缺少必要字段');
            return false;
          }
          set({ profile: parsed as StudentProfile, isLoaded: true, isDirty: true });
          return true;
        } catch (error) {
          log.error('导入失败:', error);
          return false;
        }
      },

      markSynced: () => {
        set({ isDirty: false, lastSync: Date.now() });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profile: state.profile,
        lastSync: state.lastSync,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoaded = true;
          log.info('画像从本地存储恢复:', state.profile.id);
        }
      },
      migrate: (persistedState, version) => {
        if (version === 0) {
          const state = persistedState as { profile?: Partial<StudentProfile> };
          if (state.profile && !state.profile.version) {
            state.profile.version = 1;
          }
        }
        return persistedState;
      },
    },
  ),
);

export function selectProfileCompleteness() {
  return useProfileStore.getState().profile;
}

export function useProfileSelector<T>(selector: (profile: StudentProfile) => T): T {
  return useProfileStore((state) => selector(state.profile));
}

export function useProfileActions() {
  return useProfileStore(
    useShallow((state) => ({
      setProfile: state.setProfile,
      mergeProfile: state.mergeProfile,
      updateField: state.updateField,
      addKnowledgeFoundation: state.addKnowledgeFoundation,
      updateKnowledgeFoundation: state.updateKnowledgeFoundation,
      removeKnowledgeFoundation: state.removeKnowledgeFoundation,
      addLearningGoal: state.addLearningGoal,
      updateLearningGoal: state.updateLearningGoal,
      removeLearningGoal: state.removeLearningGoal,
      addErrorPattern: state.addErrorPattern,
      recordLearningActivity: state.recordLearningActivity,
      resetProfile: state.resetProfile,
      exportProfile: state.exportProfile,
      importProfile: state.importProfile,
      markSynced: state.markSynced,
    })),
  );
}
