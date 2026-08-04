'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Search,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronUp,
  Upload,
  Sparkles,
  Atom,
  X,
  Presentation,
  Brain,
  CheckCircle2,
  Loader2,
  FileText,
} from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { useTheme } from '@/lib/hooks/use-theme';
import { nanoid } from 'nanoid';
import { deleteDocumentBlob, storeDocumentBlob } from '@/lib/utils/image-storage';
import { normalizeDocumentMimeType } from '@/lib/document/mime';
import { dedupeCourseMaterialFiles } from '@/lib/document/course-materials';
import type {
  SelectedCourseMaterial,
  SessionDocumentSource,
  UserRequirements,
  CourseFormat,
} from '@/lib/types/generation';
import { useSettingsStore } from '@/lib/store/settings';
import { hasUsableLLMProvider } from '@/lib/store/settings-validation';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import {
  StageListItem,
  listStages,
  deleteStageData,
  renameStage,
  getFirstSlideByStages,
  revokeThumbnailSlideMediaUrls,
} from '@/lib/utils/stage-storage';
import type { Slide } from '@nova/dsl';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { useImportClassroom } from '@/lib/import/use-import-classroom';
import { shouldShowVocationalTestUi } from '@/lib/config/feature-flags';
import { useImportPptx } from '@/lib/import/use-import-pptx';
import { saveStageData } from '@/lib/utils/stage-storage';
import { uploadBlobToStorage } from '@/lib/storage/client';
import { CURRENT_SLIDE_CONTENT_SCHEMA_VERSION } from '@/lib/edit/slide-schema';
import type { SlideContent } from '@/lib/types/stage';
import { makeScene } from '@/lib/types/stage';
import { InteractiveModeButton } from '@/components/generation/interactive-mode-button';
import { CourseFormatSelector } from '@/components/generation/course-format-selector';
import { LearningPathPanel } from '@/components/adaptive/learning-path-panel';
import { useProfileStore } from '@/lib/store/profile';
import { TipsCarousel } from '@/components/ui/tips-carousel';
import { SkeletonClassroomGrid } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { DemoSeedButton } from '@/components/demo-seed-button';
import { preloadData } from '@/lib/utils/preloader';
import { cacheFetch } from '@/lib/utils/cache';
import { useOnboardingStore } from '@/lib/store/onboarding';

// ── 性能优化：重型组件按需懒加载（不阻塞首屏）──
const SettingsDialog = dynamic(() => import('@/components/settings').then(m => ({ default: m.SettingsDialog })), { ssr: false });
const AgentBar = dynamic(() => import('@/components/agent/agent-bar').then(m => ({ default: m.AgentBar })), { ssr: false });
const SlideThumbnail = dynamic(() => import('@/components/slide-renderer/SlideThumbnail').then(m => ({ default: m.SlideThumbnail })), { ssr: false });
const ProfileVisualizer = dynamic(() => import('@/components/profile/ProfileVisualizer').then(m => ({ default: m.ProfileVisualizer })), { ssr: false });
const IntroScreen = dynamic(() => import('@/components/onboarding/intro-screen').then(m => ({ default: m.IntroScreen })), { ssr: false });

const log = createLogger('Home');

const PROFILE_DIMENSIONS = [
  { key: 'knowledgeFoundation', weight: 0.25 },
  { key: 'cognitiveStyle', weight: 0.15 },
  { key: 'learningGoals', weight: 0.2 },
  { key: 'modalityPreference', weight: 0.15 },
  { key: 'timeBudget', weight: 0.1 },
  { key: 'errorPatterns', weight: 0.15 },
] as const;

const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INTERACTIVE_MODE_STORAGE_KEY = 'interactiveModeEnabled';

interface FormState {
  courseMaterials: SelectedCourseMaterial[];
  requirement: string;
  webSearch: boolean;
  interactiveMode: boolean;
  vocationalTestMode: boolean;
  profileBuilt: boolean;
  courseFormat: CourseFormat;
}

const initialFormState: FormState = {
  courseMaterials: [],
  requirement: '',
  webSearch: false,
  interactiveMode: false,
  vocationalTestMode: false,
  profileBuilt: false,
  courseFormat: 'video',
};

function HomePage() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const showVocationalTestUi = shouldShowVocationalTestUi();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [showProfileBuilder, setShowProfileBuilder] = useState(false);
  // Intro splash — shown on first launch until the user completes it.
  // The store is persisted, so returning users skip straight to the main UI.
  // The intro state is stored separately (not derived) so the exit animation
  // can play: the store is marked seen *before* the fade-out completes, and
  // `showIntro` flips to false only after `onComplete` fires.
  const hasSeenIntro = useOnboardingStore((s) => s.hasSeenIntro);
  const [showIntro, setShowIntro] = useState(false);

  // Hydrate intro visibility from the persisted store after mount. This is
  // the canonical "hydrate once on mount" pattern for zustand-persist stores
  // whose initial SSR/client value differs from the persisted value.
  useEffect(() => {
    if (!hasSeenIntro) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowIntro(true);
    }
  }, [hasSeenIntro]);

  const handleIntroComplete = useCallback((selectedPrompt?: string) => {
    setShowIntro(false);
    if (selectedPrompt) {
      // Pre-fill the requirement input with the chosen starter prompt.
      setForm((prev) => ({ ...prev, requirement: selectedPrompt }));
    }
  }, []);
  // P0-1: Prevent duplicate submission. handleGenerate is async (stores docs,
  // writes sessionStorage, navigates). Without this flag, users can click again
  // before navigation completes, duplicating sessionStorage writes and document
  // uploads.
  const [isPreparing, setIsPreparing] = useState(false);
  const profile = useProfileStore((state) => state.profile);
  const profileCompleteness = useMemo(() => {
    let score = 0,
      _totalWeight = 0;
    for (const dim of PROFILE_DIMENSIONS) {
      _totalWeight += dim.weight;
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
      score += dimScore * dim.weight;
    }
    return Math.round(score * 100);
  }, [profile]);
  const mergeProfile = useProfileStore((state) => state.mergeProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // A usable LLM provider exists ⇒ a concrete model is always selected (#580
  // invariant). Gate generation on this single condition (state A vs B)
  // instead of inspecting modelId directly.
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const hasUsableProvider = hasUsableLLMProvider(providersConfig);
  const [recentOpen, setRecentOpen] = useState(true);
  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Hydrate client-only state after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      // localStorage → React state sync on mount is the canonical
      // external-state hydration pattern. Suppressed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedInteractiveMode = localStorage.getItem(INTERACTIVE_MODE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedInteractiveMode === 'true') updates.interactiveMode = true;
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Restore requirement draft from localStorage on mount. The previous derived-state
  // pattern initialised `prev` from the cached value itself, so on the first client
  // render the comparison was always equal and the restore never fired. Use an effect
  // so the cache is hydrated into the form once we know the live requirement is empty.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!cachedRequirement) return;
    draftRestoredRef.current = true;
    // One-shot draft restore from external cache into form state. Suppressed
    // — guarded by draftRestoredRef so it only fires once per mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((prev) => (prev.requirement ? prev : { ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);

  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});

  const replaceThumbnails = (slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  const loadClassrooms = useCallback(async () => {
    try {
      const list = await listStages();
      setClassrooms(list);
      if (list.length > 0) {
        const slides = await getFirstSlideByStages(list.map((c) => c.id));
        replaceThumbnails(slides);
      } else {
        replaceThumbnails({});
      }
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  }, []);

  const { importing, fileInputRef, triggerFileSelect, handleFileChange } = useImportClassroom(
    () => {
      loadClassrooms();
    },
  );

  // PPTX import: upload media blobs to object storage (falls back to blob:
  // URL when storage is unconfigured), then persist the parsed slides as a
  // new classroom in IndexedDB.
  const handlePptxUpload = useCallback(
    async (blob: Blob, _filename: string, _dir?: string): Promise<string> => {
      const url = await uploadBlobToStorage(blob, 'media');
      return url ?? URL.createObjectURL(blob);
    },
    [],
  );

  const handlePptxImported = useCallback(
    async (slides: Slide[]) => {
      if (slides.length === 0) return;
      const stageId = nanoid();
      const now = Date.now();
      const scenes = slides.map((canvas, index) => {
        const content: SlideContent = {
          type: 'slide',
          schemaVersion: CURRENT_SLIDE_CONTENT_SCHEMA_VERSION,
          canvas,
        };
        return makeScene(
          {
            id: nanoid(),
            stageId,
            title: `Slide ${index + 1}`,
            order: index + 1,
            createdAt: now,
            updatedAt: now,
          },
          content,
        );
      });
      await saveStageData(stageId, {
        stage: {
          id: stageId,
          name: t('import.pptxClassName', { defaultValue: 'Imported PPTX' }),
          createdAt: now,
          updatedAt: now,
        },
        scenes,
        currentSceneId: scenes[0]?.id ?? null,
        chats: [],
      });
      loadClassrooms();
    },
    [t, loadClassrooms],
  );

  const {
    importing: pptxImporting,
    fileInputRef: pptxFileInputRef,
    triggerFileSelect: triggerPptxFileSelect,
    handleFileChange: handlePptxFileChange,
  } = useImportPptx({
    upload: handlePptxUpload,
    onImported: handlePptxImported,
  });

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Initial data load on mount — setState in the .finally is the canonical
    // "loading → done" transition. Suppressed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadClassrooms().finally(() => setClassroomsLoading(false));

    // Background warm: touch cached data so it's ready when needed
    preloadData(() =>
      cacheFetch(
        'provider-config-cache',
        () => Promise.resolve(useSettingsStore.getState().providersConfig),
        300_000,
      ),
    );

    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
  }, [loadClassrooms]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      await deleteStageData(id);
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error(t('classroom.deleteFailed'));
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      await renameStage(id, newName);
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      if (field === 'interactiveMode')
        localStorage.setItem(INTERACTIVE_MODE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const addCourseMaterials = (files: File[]) => {
    setForm((prev) => {
      const dedupedFiles = dedupeCourseMaterialFiles(prev.courseMaterials, files);
      const startOrder = prev.courseMaterials.length + 1;
      const additions = dedupedFiles.map((file, index) => ({
        id: nanoid(8),
        file,
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        type: file.type,
        order: startOrder + index,
      }));

      return additions.length > 0
        ? { ...prev, courseMaterials: [...prev.courseMaterials, ...additions] }
        : prev;
    });
  };

  const removeCourseMaterial = (id: string) => {
    setForm((prev) => ({
      ...prev,
      courseMaterials: prev.courseMaterials
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index + 1 })),
    }));
  };

  const handleGenerate = async () => {
    // No model/provider guard here: generation is gated by `canGenerate`
    // (requires a usable provider), and under the #580 invariant a usable
    // provider always has a concrete model. State A (no usable provider)
    // surfaces through the toolbar's single Configure-Provider affordance.
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }

    // P0-1: Re-entry guard. handleGenerate stores documents (network),
    // writes sessionStorage, and navigates. A second click before navigation
    // finishes would re-upload documents and overwrite the session.
    if (isPreparing) return;

    setError(null);
    setIsPreparing(true);

    try {
      const userProfile = useUserProfileStore.getState();
      const requirements: UserRequirements = {
        requirement: form.requirement,
        userNickname: userProfile.nickname || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        interactiveMode: form.vocationalTestMode ? true : form.interactiveMode,
        ...(form.vocationalTestMode ? { taskEngineMode: true } : {}),
        courseFormat: form.courseFormat,
      };

      let documentSources: SessionDocumentSource[] | undefined;
      let pdfProviderId: string | undefined;
      let pdfProviderConfig:
        | { apiKey?: string; baseUrl?: string; accessKeyId?: string; accessKeySecret?: string }
        | undefined;

      if (form.courseMaterials.length > 0) {
        const settings = useSettingsStore.getState();
        pdfProviderId = settings.pdfProviderId;
        const providerCfg = settings.pdfProvidersConfig?.[settings.pdfProviderId];
        if (providerCfg) {
          pdfProviderConfig = {
            apiKey: providerCfg.apiKey,
            baseUrl: providerCfg.baseUrl,
            accessKeyId: providerCfg.accessKeyId,
            accessKeySecret: providerCfg.accessKeySecret,
          };
        }

        const storedDocumentKeys: string[] = [];
        try {
          documentSources = [];
          const orderedMaterials = [...form.courseMaterials].sort((a, b) => a.order - b.order);
          for (const [index, item] of orderedMaterials.entries()) {
            const storageKey = await storeDocumentBlob(item.file);
            storedDocumentKeys.push(storageKey);
            documentSources.push({
              id: item.id,
              name: item.name,
              size: item.size,
              lastModified: item.lastModified,
              mimeType: normalizeDocumentMimeType({
                mimeType: item.file.type,
                fileName: item.file.name,
              }),
              order: index + 1,
              storageKey,
              providerId: pdfProviderId,
            });
          }
        } catch (error) {
          await Promise.allSettled(storedDocumentKeys.map((key) => deleteDocumentBlob(key)));
          throw error;
        }
      }

      const sessionState = {
        sessionId: nanoid(),
        requirements,
        pdfText: '',
        pdfImages: [],
        imageStorageIds: [],
        documentSources,
        // Backward-compatible single-document fields for previously saved sessions.
        pdfStorageKey: documentSources?.[0]?.storageKey,
        pdfFileName: documentSources?.[0]?.name,
        documentMimeType: documentSources?.[0]?.mimeType,
        pdfProviderId,
        pdfProviderConfig,
        sceneOutlines: null,
        currentStep: 'generating' as const,
      };
      sessionStorage.setItem('generationSession', JSON.stringify(sessionState));

      router.push('/generation-preview');
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      // P0-1: Release the guard on all exit paths (success navigates away,
      // failure surfaces an error). Without finally, a thrown error would
      // leave isPreparing stuck true and the button permanently disabled.
      setIsPreparing(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate = !!form.requirement.trim() && hasUsableProvider;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      // P0-1: Honor the preparing guard on keyboard submit too, otherwise
      // Cmd/Ctrl+Enter would bypass the button's disabled state.
      if (canGenerate && !isPreparing) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center px-4 pt-[max(0.75rem,var(--safe-area-top))] pb-6 sm:px-8 sm:pt-16 sm:pb-8 overflow-x-hidden">
      {/* Intro splash — rendered on top of the main UI until the user completes it */}
      {showIntro && <IntroScreen onComplete={handleIntroComplete} />}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={pptxFileInputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={handlePptxFileChange}
        className="hidden"
      />
      {/* ═══ Top-right pill (desktop only — on mobile it folds into the hero header) ═══ */}
      <div
        ref={toolbarRef}
        className="hidden sm:flex fixed top-4 right-4 z-50 items-center gap-0.5 sm:gap-0.5 bg-white/70 dark:bg-gray-800/70 backdrop-blur-md px-1.5 py-1.5 rounded-full border border-gray-200/60 dark:border-gray-700/60 shadow-sm shadow-black/[0.04] dark:shadow-black/30"
        style={{ paddingTop: 'max(0.5rem, var(--safe-area-top))' }}
      >
        {/* Language Selector */}
        <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

        <div className="w-px h-4 bg-gray-200/80 dark:bg-gray-700/80 mx-0.5" />

        {/* Theme Selector */}
        <div className="relative">
          <IconButton
            size="compact"
            variant="ghost"
            onClick={() => setThemeOpen(!themeOpen)}
            aria-label={t('settings.theme')}
            title={t('settings.theme')}
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </IconButton>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200/80 dark:border-gray-700/80 rounded-xl shadow-lg overflow-hidden z-50 min-w-[160px] py-1">
              {(['light', 'dark', 'system'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setTheme(opt);
                    setThemeOpen(false);
                  }}
                  className={cn(
                    'w-full px-3.5 py-2 text-left text-[13px] transition-colors flex items-center gap-2.5',
                    'hover:bg-gray-100/80 dark:hover:bg-gray-700/80',
                    theme === opt &&
                      'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 font-medium',
                  )}
                >
                  {opt === 'light' && <Sun className="w-3.5 h-3.5" />}
                  {opt === 'dark' && <Moon className="w-3.5 h-3.5" />}
                  {opt === 'system' && <Monitor className="w-3.5 h-3.5" />}
                  {t(`settings.themeOptions.${opt}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200/80 dark:bg-gray-700/80 mx-0.5" />

        {/* Profile Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              size="compact"
              variant="ghost"
              onClick={() => setShowProfileBuilder(true)}
              aria-label={
                profileCompleteness >= 100 ? t('profile.complete') : t('profile.buildProfile')
              }
              title={
                profileCompleteness >= 100
                  ? t('profile.complete')
                  : `${t('profile.buildProfile')} (${profileCompleteness}%)`
              }
              className={cn(
                profileCompleteness >= 100 && 'text-green-500 dark:text-green-400',
              )}
            >
              {profileCompleteness >= 100 ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Brain className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              )}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {profileCompleteness >= 100
              ? t('profile.complete')
              : `${t('profile.buildProfile')} (${profileCompleteness}%)`}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-gray-200/80 dark:bg-gray-700/80 mx-0.5" />

        {/* Settings Button */}
        <div data-tour="settings">
          <IconButton
            size="compact"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('settings.title')}
            title={t('settings.title')}
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </IconButton>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor — soft, layered glow that doesn't crowd the hero.
          Pulled back to subtle, off-center, slow gentle pulse so it reads
          as ambient color rather than a glitch. Pushed further off-canvas so
          they never bleed into the input card. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-24 w-[420px] h-[420px] bg-rose-400/[0.08] dark:bg-rose-500/[0.08] rounded-full blur-3xl"
          style={{ animation: 'pulse 7s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-40 -left-24 w-[420px] h-[420px] bg-amber-300/[0.08] dark:bg-amber-500/[0.06] rounded-full blur-3xl"
          style={{ animation: 'pulse 9s ease-in-out infinite 1.5s' }}
        />
      </div>

      {/* ═══ Hero section: title + input (centered, wider) ═══
          Tighter top margin on desktop (mt-6 instead of mt-[10vh]) so the
          first paint lands on the input card, not on a wall of empty space. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[800px] flex flex-col items-center',
          classrooms.length === 0
            ? 'justify-center min-h-[calc(100dvh-7rem)]'
            : 'mt-4 sm:mt-6',
        )}
      >
        {/* ── Logo ── — smaller on mobile (h-10) so it doesn't dwarf the
            input card; full h-16 on desktop. */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="mb-1.5 sm:mb-2 -ml-2 md:-ml-3"
        >
          <img
            src="/logo-horizontal.svg"
            alt="Nova"
            loading="eager"
            decoding="async"
            className="h-10 sm:h-16 w-auto"
          />
        </motion.h1>

        {/* ── Slogan ── — closer to the logo on mobile (mb-4) so the
            hero reads as a single unit. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-[11.5px] sm:text-sm text-muted-foreground/60 mb-4 sm:mb-7 px-2 sm:px-0 line-clamp-2 sm:line-clamp-none"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Profile Builder (Step 1) ── */}
        <AnimatePresence mode="wait">
          {showProfileBuilder && (
            <motion.div
              key="profile-builder"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full mb-8"
            >
              <ProfileVisualizer
                mode="wizard"
                profile={profile}
                onComplete={(p) => {
                  mergeProfile(p);
                  setShowProfileBuilder(false);
                }}
                onCancel={() => setShowProfileBuilder(false)}
                showCompleteness={true}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Learning Path ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="w-full mb-6"
        >
          <LearningPathPanel />
        </motion.div>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-pink-500/[0.06] overflow-hidden">
            {/* ── Mobile compact header: avatar+name (left) + lang/theme/settings (right) ──
                Tight 8px top padding + 6px bottom + hairline divider — the
                hero card now reads as one compact, intentional surface with
                three clearly delineated bands (header / textarea / toolbar). */}
            <div className="flex sm:hidden items-center justify-between gap-2 px-3 pt-2 pb-1.5 border-b border-border/30">
              <GreetingBar compact />
              <MobileTopRightInline
                onSettingsOpen={() => setSettingsOpen(true)}
                onProfileOpen={() => setShowProfileBuilder(true)}
                profileCompleteness={profileCompleteness}
                theme={theme}
                onThemeChange={setTheme}
              />
            </div>
            {/* ── Desktop: Greeting + Profile + Agents ── */}
            <div className="relative z-20 hidden sm:flex items-start justify-between gap-2 flex-row px-1">
              <GreetingBar />
              <div className="pr-3 pt-3.5 shrink min-w-0 w-full sm:w-auto sm:max-w-[60%]">
                <AgentBar />
              </div>
            </div>
            {/* ── Mobile: AgentBar under the header line — tighter so the
                textarea gets more room and the hero feels less stacked. ── */}
            <div className="sm:hidden px-3 pt-1.5 pb-1.5">
              <AgentBar />
            </div>

            {/* Textarea — slightly larger mobile tap target padding
                (pt-2 / pb-2) so the cursor doesn't sit on the hairline
                border above and so the placeholder doesn't crowd the
                hairline border below. Desktop stays 140px min so
                multi-line prompts feel intentional, not cramped. */}
            <textarea
              ref={textareaRef}
              placeholder={t('upload.requirementPlaceholder')}
              className="w-full resize-none border-0 bg-transparent px-4 sm:px-5 py-3 sm:py-2.5 text-[15px] sm:text-[13.5px] leading-relaxed placeholder:text-muted-foreground/45 focus:outline-none min-h-[96px] sm:min-h-[140px] max-h-[200px] sm:max-h-[300px]"
              value={form.requirement}
              onChange={(e) => updateForm('requirement', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              data-tour="hero-input"
            />

            {/* Toolbar row — restructured for visual clarity on both
                mobile and desktop:
                  • Mobile: vertical stack with a 1px hairline above the
                    toolbar so the textarea/toolbar split is unmistakable;
                    send button stays full-width below for an obvious primary
                    action. The "Enter Classroom" label is shown on mobile
                    too so the CTA is unambiguous (was previously icon-only
                    in a small floating button, which read as "send" not
                    "start lesson").
                  • Desktop: side-by-side, same as before, with the wider
                    send button. */}
            <div className="px-3 sm:px-4 pt-1.5 pb-3 sm:pb-3.5 flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-2 border-t border-border/30">
              <div className="w-full sm:flex-1 sm:min-w-[180px]">
                <GenerationToolbar
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  courseMaterials={form.courseMaterials}
                  onCourseMaterialsAdd={addCourseMaterials}
                  onCourseMaterialRemove={removeCourseMaterial}
                  onPdfError={setError}
                />
              </div>

              {/* Action row: tool toggles (left) + primary send (right).
                  On mobile, send is full-width to feel like the dominant
                  CTA. On desktop it stays compact (icon + label). */}
              <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto sm:shrink-0">
                <div className="flex items-center gap-0.5 sm:gap-1">
                  {/* Interactive mode toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InteractiveModeButton
                        pressed={form.interactiveMode}
                        label={t('toolbar.interactiveModeLabel')}
                        onPressedChange={(pressed) => updateForm('interactiveMode', pressed)}
                        data-tour="interactive-mode"
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {t('toolbar.interactiveModeHint')}
                    </TooltipContent>
                  </Tooltip>

                  {/* Course format selector (video / ppt+audio / text-only) */}
                  <CourseFormatSelector
                    value={form.courseFormat}
                    onChange={(value) => updateForm('courseFormat', value)}
                    title={t('toolbar.courseFormatHint')}
                    data-tour="course-format"
                  />

                  {/* Voice input */}
                  <SpeechButton
                    size="md"
                    onTranscription={(text) => {
                      setForm((prev) => {
                        const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                        updateRequirementCache(next);
                        return { ...prev, requirement: next };
                      });
                    }}
                  />
                </div>

                {/* Send button — full width on mobile, compact on desktop.
                    On mobile we keep the label visible so the primary action
                    reads as "start the lesson" rather than an ambiguous
                    paper-plane icon. */}
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isPreparing}
                  aria-label={t('toolbar.enterClassroom')}
                  className={cn(
                    'shrink-0 h-10 sm:h-9 rounded-xl flex items-center justify-center gap-1.5 transition-all px-3 sm:px-3',
                    'flex-1 sm:flex-initial',
                    canGenerate && !isPreparing
                      ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:opacity-95 shadow-sm shadow-rose-500/20 active:scale-[0.98] cursor-pointer'
                      : 'bg-muted text-muted-foreground/50 cursor-not-allowed',
                  )}
                >
                  {isPreparing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      <span className="text-[13px] font-semibold">
                        {t('toolbar.enterClassroom')}
                      </span>
                      <ArrowUp className="size-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {showVocationalTestUi && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-2 flex w-full justify-start px-1"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.vocationalTestMode}
                  onClick={() => updateForm('vocationalTestMode', !form.vocationalTestMode)}
                  className={cn(
                    'inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    form.vocationalTestMode
                      ? 'border-cyan-400/70 bg-cyan-50 text-cyan-700 shadow-[0_0_10px_rgba(6,182,212,0.16)] dark:bg-cyan-950/40 dark:text-cyan-300'
                      : 'border-border/70 bg-background/70 text-muted-foreground hover:border-cyan-300/60 hover:text-cyan-700 dark:hover:text-cyan-300',
                  )}
                >
                  <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-cyan-700 dark:bg-cyan-900/45 dark:text-cyan-300">
                    {t('home.vocationalTestBadge')}
                  </span>
                  <Sparkles className="size-3.5" />
                  <span>{t('home.vocationalTestLabel')}</span>
                  <span
                    className={cn(
                      'relative h-3.5 w-6 rounded-full transition-colors',
                      form.vocationalTestMode ? 'bg-cyan-500' : 'bg-muted-foreground/25',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-2.5 rounded-full bg-white transition-transform',
                        form.vocationalTestMode ? 'translate-x-3' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {t('home.vocationalTestTooltip')}
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tips Carousel (empty state) ── — wrapped in a soft tinted
            card with a single border so the carousel reads as one widget
            (rather than floating text in a void). Import and PPTX buttons
            sit on a single row, with stronger contrast than before
            (text-muted-foreground/55 was too faint). */}
        {classrooms.length === 0 && (
          <div className="relative z-10 mt-5 w-full max-w-md">
            <div className="rounded-2xl border border-border/40 bg-white/55 dark:bg-slate-900/45 backdrop-blur-sm px-3.5 py-3 shadow-sm">
              <TipsCarousel />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                onClick={triggerFileSelect}
                disabled={importing}
                aria-label={t('import.classroom')}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/60 dark:bg-slate-900/50 backdrop-blur-sm px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors"
              >
                <Upload className="size-3.5" />
                <span>{t('import.classroom')}</span>
              </button>
              <button
                onClick={triggerPptxFileSelect}
                disabled={pptxImporting}
                aria-label={t('import.pptx')}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/60 dark:bg-slate-900/50 backdrop-blur-sm px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors"
              >
                <Presentation className="size-3.5" />
                <span>{t('import.pptx')}</span>
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-center">
              <DemoSeedButton />
            </div>
          </div>
        )}
      </motion.div>

      {/* ═══ Recent classrooms — collapsible ═══ — Tighter top margin on
          mobile (mt-6) so the section doesn't feel detached from the hero. */}
      {(classrooms.length > 0 || classroomsLoading) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-6 sm:mt-8 w-full max-w-6xl flex flex-col items-center"
          data-tour="recent-classrooms"
        >
          {/* Trigger — divider-line with centered text. Tighter gap
              (gap-1.5) and slightly stronger label color so the section
              header reads as a real section break, not a faded whisper. */}
          <div className="group w-full flex items-center gap-2 sm:gap-3 py-2">
            <div className="flex-1 h-px bg-border/50 group-hover:bg-border/80 transition-colors" />
            <div className="shrink-0 flex items-center gap-1.5 sm:gap-2 text-[12.5px] sm:text-[13px] text-muted-foreground/80 select-none flex-wrap justify-center">
              <button
                onClick={() => persistRecentOpen(!recentOpen)}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer"
              >
                <Clock className="size-3.5" />
                <span className="font-medium">{t('classroom.recentClassrooms')}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground/60">
                  {classrooms.length}
                </span>
                <motion.div
                  animate={{ rotate: recentOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <ChevronDown className="size-3.5" />
                </motion.div>
              </button>

              {/* Search toggle — icon that expands into an input in place */}
              <AnimatePresence initial={false}>
                {!searchOpen ? (
                  <motion.button
                    key="search-icon"
                    ref={searchButtonRef}
                    type="button"
                    aria-label={t('classroom.searchAriaLabel')}
                    onClick={() => {
                      setSearchOpen(true);
                      if (!recentOpen) persistRecentOpen(true);
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    className="flex items-center justify-center size-6 rounded-full text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Search className="size-3.5" />
                  </motion.button>
                ) : (
                  <motion.div
                    key="search-input"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 200 }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <InputGroup
                      className={cn(
                        'h-7 text-[12px] rounded-full bg-muted/40 border-transparent shadow-none',
                        'transition-colors',
                        'hover:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:border-transparent',
                        'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
                      )}
                    >
                      <InputGroupInput
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            if (searchQuery) {
                              setSearchQuery('');
                            } else {
                              setSearchOpen(false);
                              requestAnimationFrame(() => searchButtonRef.current?.focus());
                            }
                          }
                        }}
                        onBlur={() => {
                          if (!searchQuery) {
                            setSearchOpen(false);
                          }
                        }}
                        placeholder={t('classroom.searchPlaceholder')}
                        aria-label={t('classroom.searchAriaLabel')}
                        className="h-7 pl-3 placeholder:text-muted-foreground/50"
                      />
                      {searchQuery && (
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={t('classroom.clearSearch')}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                        >
                          <X />
                        </InputGroupButton>
                      )}
                    </InputGroup>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={triggerFileSelect}
                disabled={importing}
                className="group/import grid grid-cols-[auto_1fr] sm:grid-cols-[auto_0fr] sm:hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/70 sm:text-muted-foreground/45 hover:text-muted-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
              >
                <Upload className="size-3" />
                <span className="overflow-hidden opacity-100 sm:opacity-0 sm:group-hover/import:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  {t('import.classroom')}
                </span>
              </button>
              <button
                onClick={triggerPptxFileSelect}
                disabled={pptxImporting}
                className="group/import-pptx grid grid-cols-[auto_1fr] sm:grid-cols-[auto_0fr] sm:hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/70 sm:text-muted-foreground/45 hover:text-muted-foreground hover:bg-muted/50 transition-all duration-200 cursor-pointer"
              >
                <Presentation className="size-3" />
                <span className="overflow-hidden opacity-100 sm:opacity-0 sm:group-hover/import-pptx:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                  {t('import.pptx')}
                </span>
              </button>
            </div>
            <div className="flex-1 h-px bg-border/50 group-hover:bg-border/80 transition-colors" />
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                {classroomsLoading ? (
                  <div className="pt-6 sm:pt-6">
                    <SkeletonClassroomGrid />
                  </div>
                ) : searchQuery.trim() && filteredClassrooms.length === 0 ? (
                  <div className="pt-6 sm:pt-10 pb-2">
                    <EmptyState
                      icon={Search}
                      size="sm"
                      title={t('classroom.searchEmpty')}
                      description={t('classroom.searchEmptyHint') || ''}
                    />
                  </div>
                ) : (
                  <div className="pt-4 sm:pt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-x-5 sm:gap-y-7">
                    {filteredClassrooms.map((classroom, i) => (
                      <motion.div
                        key={classroom.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.04,
                          duration: 0.35,
                          ease: 'easeOut',
                        }}
                      >
                        <ClassroomCard
                          classroom={classroom}
                          slide={thumbnails[classroom.id]}
                          formatDate={formatDate}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          confirmingDelete={pendingDeleteId === classroom.id}
                          onConfirmDelete={() => confirmDelete(classroom.id)}
                          onCancelDelete={() => setPendingDeleteId(null)}
                          onClick={() => router.push(`/classroom/${classroom.id}`)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — stronger color and tighter line-height so the bottom of
          the page reads as a deliberate attribution, not a footer stuck on
          as an afterthought. Tighter top padding on mobile. */}
      <div className="mt-auto pt-6 sm:pt-10 pb-[max(1rem,var(--safe-area-bottom))] text-center text-[10.5px] sm:text-[11px] tracking-wide text-muted-foreground/55 px-4">
        {t('home.footer')}
      </div>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || t('userProfile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('userProfile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('userProfile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full sm:w-auto',
        compact ? 'pl-0 pr-0 pt-0 pb-0' : 'pl-4 pr-2 pt-3.5 pb-1',
      )}
    >
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className={cn(
            // Compact (mobile hero strip): remove the border + background —
            // the row already sits on a card surface, so the pill is pure
            // avatar+name. Adds back the avatar's hover halo + tap-press so
            // the affordance still reads as a button even without a pill.
            'flex items-center cursor-pointer transition-all duration-200 group rounded-full min-w-0',
            compact
              ? 'gap-1.5 px-1 py-1 border-transparent bg-transparent active:scale-[0.97]'
              : 'gap-2.5 px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]',
          )}
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div
              className={cn(
                'rounded-full overflow-hidden ring-[1.5px] transition-all duration-300',
                compact ? 'size-7 ring-border/30' : 'size-8 ring-border/30',
                'group-hover:ring-pink-400/60 dark:group-hover:ring-pink-400/40',
              )}
            >
              <img
                src={avatar}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </div>
            {!compact && (
              <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
                <Pencil className="size-[7px] text-muted-foreground/70" />
              </div>
            )}
          </div>
          {!compact && (
            <div className="flex-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="leading-none select-none flex items-center gap-1 min-w-0">
                    <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors truncate min-w-0">
                      {t('home.greetingWithName', { name: displayName })}
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  {t('userProfile.editTooltip')}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          {compact && (
            <div className="flex items-center gap-0.5 min-w-0">
              <span className="text-[13px] font-semibold text-foreground/85 truncate max-w-[140px]">
                {displayName}
              </span>
              <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
            </div>
          )}
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn(
              'absolute z-50',
              compact
                ? 'left-0 right-0 top-full mt-2 w-full'
                : 'left-2 right-2 sm:left-4 sm:right-auto top-3.5 w-auto sm:w-64',
            )}
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-pink-300/70 dark:ring-pink-500/40 transition-all duration-300">
                    <img
                      src={avatar}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('userProfile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-pink-400 dark:ring-pink-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img
                              src={url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="size-full"
                            />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-pink-400 dark:ring-pink-500 ring-offset-0 border-pink-300 dark:border-pink-600 bg-pink-50 dark:bg-pink-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('userProfile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('userProfile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── MobileTopRightInline — compact icon row used inside the hero card on mobile ──
function MobileTopRightInline({
  onSettingsOpen,
  onProfileOpen,
  profileCompleteness,
  theme,
  onThemeChange,
}: {
  onSettingsOpen: () => void;
  onProfileOpen: () => void;
  profileCompleteness: number;
  theme: string;
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
}) {
  const { t } = useI18n();
  const [themeOpen, setThemeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [themeOpen]);

  return (
    <div ref={ref} className="flex items-center gap-0.5 shrink-0">
      {/* Language */}
      <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

      {/* Theme toggle */}
      <div className="relative">
        <IconButton
          size="sm"
          variant="ghost"
          onClick={() => setThemeOpen(!themeOpen)}
          aria-label={t('settings.theme')}
          title={t('settings.theme')}
        >
          {theme === 'light' && <Sun className="w-4 h-4" />}
          {theme === 'dark' && <Moon className="w-4 h-4" />}
          {theme === 'system' && <Monitor className="w-4 h-4" />}
        </IconButton>
        {themeOpen && (
          <div className="absolute top-full right-0 mt-1.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-border/60 rounded-xl shadow-lg overflow-hidden z-50 min-w-[140px] py-1">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onThemeChange(opt);
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-[12.5px] transition-colors flex items-center gap-2 active:scale-[0.98]',
                  'hover:bg-muted',
                  theme === opt &&
                    'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 font-medium',
                )}
              >
                {opt === 'light' && <Sun className="w-3.5 h-3.5" />}
                {opt === 'dark' && <Moon className="w-3.5 h-3.5" />}
                {opt === 'system' && <Monitor className="w-3.5 h-3.5" />}
                {t(`settings.themeOptions.${opt}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Profile */}
      <IconButton
        size="sm"
        variant="ghost"
        onClick={onProfileOpen}
        aria-label={profileCompleteness >= 100 ? t('profile.complete') : t('profile.buildProfile')}
        title={t('profile.buildProfile')}
        className={cn(
          profileCompleteness >= 100 && 'text-green-500 dark:text-green-400',
        )}
      >
        {profileCompleteness >= 100 ? (
          <CheckCircle2 className="w-4 h-4" />
        ) : (
          <Brain className="w-4 h-4" />
        )}
      </IconButton>

      {/* Settings */}
      <IconButton
        size="sm"
        variant="ghost"
        onClick={onSettingsOpen}
        aria-label={t('settings.title')}
        title={t('settings.title')}
      >
        <Settings className="w-4 h-4" />
      </IconButton>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const isTaskEngineMode = classroom.taskEngineMode === true;
  const showModeBadge = classroom.interactiveMode || isTaskEngineMode;
  const ModeBadgeIcon = isTaskEngineMode ? Sparkles : Atom;
  const modeBadgeLabel = isTaskEngineMode ? t('classroom.vocationalMode') : t('toolbar.interactiveModeLabel');

  // courseFormat badge: only show for non-default formats (ppt-audio / text-only)
  const courseFormat = classroom.courseFormat;
  const showFormatBadge = courseFormat && courseFormat !== 'video';
  const FormatBadgeIcon = courseFormat === 'text-only' ? FileText : Presentation;
  const formatBadgeLabel =
    courseFormat === 'text-only'
      ? t('toolbar.courseFormatTextOnly')
      : courseFormat === 'ppt-audio'
        ? t('toolbar.courseFormatPptAudio')
        : '';

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'group cursor-pointer flex sm:block gap-3 sm:gap-0 items-stretch',
        // Mobile: subtle hairline + soft bg so the horizontal card reads
        // as one surface rather than two adjacent blocks floating in
        // space. Desktop keeps the unadorned vertical card (the
        // thumbnail does the framing work there). The transition on
        // hover/active gives a subtle press feedback on touch.
        'sm:bg-transparent sm:ring-0 sm:px-0 sm:py-0',
        'rounded-2xl ring-1 ring-border/40 bg-white/65 dark:bg-slate-900/45 px-2.5 py-2.5',
        'transition-all duration-200 active:scale-[0.99] hover:ring-border/70 hover:bg-white/80 dark:hover:bg-slate-900/55',
      )}
      role={confirmingDelete ? undefined : 'button'}
      tabIndex={confirmingDelete ? -1 : 0}
      onClick={confirmingDelete ? undefined : onClick}
      onKeyDown={
        confirmingDelete
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
      }
    >
      {/* Thumbnail — large radius, no border, subtle bg.
          Mobile uses w-[120px] (16:9 → 67.5px tall) so the right column
          gets enough horizontal room for the classroom name to fit
          on one line. Anything smaller than 120 and titles truncate
          immediately on 360-390px viewports. */}
      <div
        ref={thumbRef}
        className="relative w-[120px] sm:w-full shrink-0 sm:shrink aspect-[16/9] rounded-lg sm:rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <SlideThumbnail
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-pink-100 to-rose-100 dark:from-pink-900/30 dark:to-rose-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute bottom-2 left-2 inline-flex items-center justify-center size-5 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm z-10',
                  isTaskEngineMode
                    ? 'text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/35'
                    : 'text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30',
                )}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            {/* Negative sideOffset compensates for the global Tooltip Arrow's
                rotate-45 bounding box, which Radix reserves as spacing. */}
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
              {modeBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        {/* courseFormat badge — only for non-default formats */}
        {showFormatBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={formatBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute bottom-2 inline-flex items-center justify-center size-5 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm z-10',
                  courseFormat === 'text-only'
                    ? 'left-9 text-slate-600 dark:text-slate-300 ring-1 ring-slate-500/30'
                    : 'left-9 text-violet-600 dark:text-violet-300 ring-1 ring-violet-500/30',
                )}
              >
                <FormatBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
              {formatBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete — top-right, always visible on mobile, hover on desktop */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('classroom.delete')}
                title={t('classroom.delete')}
                className="absolute top-2 right-2 size-7 bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('classroom.rename')}
                title={t('classroom.rename')}
                className="absolute top-2 right-11 size-7 bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail (on mobile, sits to the right; on desktop, below) */}
      <div className="flex-1 sm:flex-none min-w-0 flex flex-col justify-center gap-1 sm:gap-1.5 sm:mt-0">
        <div className="px-0 sm:px-1 flex items-center gap-1.5 flex-wrap">
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-100/80 to-rose-100/80 dark:from-pink-900/30 dark:to-rose-900/30 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-pink-600 dark:text-pink-300 ring-1 ring-pink-200/40 dark:ring-pink-800/40">
            <span className="tabular-nums">{classroom.sceneCount}</span>
            <span className="opacity-70">·</span>
            <span>{t('classroom.slides')}</span>
            <span className="opacity-50">·</span>
            <span className="opacity-80">{formatDate(classroom.updatedAt)}</span>
          </span>
        </div>
        <div className="px-0 sm:px-1 flex items-center gap-2 mt-0 sm:mt-0">
          {editing ? (
            <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              <input
                ref={nameInputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditing(false);
                }}
                onBlur={commitRename}
                maxLength={100}
                placeholder={t('classroom.renamePlaceholder')}
                className="w-full bg-transparent border-b border-pink-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <p
                  className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
                  onDoubleClick={startRename}
                >
                  {classroom.name}
                </p>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={4}
                className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
              >
                <div className="flex items-center gap-1.5">
                  <span className="break-all">{classroom.name}</span>
                  <button
                    className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(classroom.name);
                      toast.success(t('classroom.nameCopied'));
                    }}
                  >
                    <Copy className="size-3 opacity-60" />
                  </button>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {/* Mobile-only action row (rename + delete) */}
        <div className="sm:hidden flex items-center gap-1 mt-0.5">
          <button
            type="button"
            aria-label={t('classroom.rename')}
            onClick={startRename}
            className="shrink-0 flex items-center gap-1 px-2 h-7 rounded-full text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Pencil className="size-3" />
            <span>{t('classroom.rename')}</span>
          </button>
          <button
            type="button"
            aria-label={t('classroom.delete')}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(classroom.id, e);
            }}
            className="shrink-0 flex items-center gap-1 px-2 h-7 rounded-full text-[11px] text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="size-3" />
            <span>{t('classroom.delete')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
