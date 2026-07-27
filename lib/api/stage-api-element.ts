/**
 * Stage API - Element Operations
 *
 * Factory function that creates the element namespace of the Stage API.
 * Handles element CRUD operations for slide-type scenes.
 */

import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement } from '@nova/dsl';
import type { StageStore, APIResult, CreateElementParams } from './stage-api-types';
import { generateId, getScene } from './stage-api-defaults';

/**
 * Create the element management API
 *
 * @param store - Zustand store instance
 * @returns Element namespace API
 */
export function createElementAPI(store: StageStore) {
  return {
    /**
     * Add an element to a Slide
     *
     * @param sceneId - Scene ID
     * @param element - Element parameters (must include type, left, top, width, height)
     * @returns Element ID
     */
    add(sceneId: string, element: CreateElementParams): APIResult<string> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== 'slide') {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const elementId = generateId(element.type);

        const newElement: PPTElement = {
          ...element,
          id: elementId,
          rotate: element.rotate ?? 0,
        } as PPTElement;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: [...content.canvas.elements, newElement],
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: elementId };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Delete an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @returns Whether successful
     */
    delete(sceneId: string, elementId: string): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== 'slide') {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.filter((el) => el.id !== elementId),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Update an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @param updates - Properties to update
     * @returns Whether successful
     */
    update(sceneId: string, elementId: string, updates: Partial<PPTElement>): APIResult<boolean> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== 'slide') {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;

        const newScenes = state.scenes.map((s) => {
          if (s.id === sceneId) {
            return {
              ...s,
              content: {
                ...content,
                canvas: {
                  ...content.canvas,
                  elements: content.canvas.elements.map((el) =>
                    el.id === elementId ? { ...el, ...updates } : el,
                  ),
                },
              },
              updatedAt: Date.now(),
            };
          }
          return s;
        });

        store.setState({ scenes: newScenes });

        return { success: true, data: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get an element
     *
     * @param sceneId - Scene ID
     * @param elementId - Element ID
     * @returns Element object
     */
    get(sceneId: string, elementId: string): APIResult<PPTElement> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== 'slide') {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        const element = content.canvas.elements.find((el) => el.id === elementId);

        if (!element) {
          return { success: false, error: `Element not found: ${elementId}` };
        }

        return { success: true, data: element };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },

    /**
     * Get all elements of a scene
     *
     * @param sceneId - Scene ID
     * @returns Element list
     */
    list(sceneId: string): APIResult<PPTElement[]> {
      try {
        const state = store.getState();
        const scene = getScene(state.scenes, sceneId);

        if (!scene) {
          return { success: false, error: `Scene not found: ${sceneId}` };
        }

        if (scene.type !== 'slide') {
          return { success: false, error: `Scene is not a slide: ${sceneId}` };
        }

        const content = scene.content as SlideContent;
        return { success: true, data: [...content.canvas.elements] };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  };
}
