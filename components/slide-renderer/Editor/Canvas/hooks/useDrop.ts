import { useEffect, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store';

interface UseDropOptions {
  /** Insert a text element at the given canvas coordinates. */
  onTextDrop?: (canvasX: number, canvasY: number, text: string) => void;
}

export function useDrop(
  elementRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  options: UseDropOptions = {},
) {
  const disableHotkeys = useCanvasStore.use.disableHotkeys();
  const canvasScale = useCanvasStore.use.canvasScale();
  const { onTextDrop } = options;

  useEffect(() => {
    const element = elementRef.current;
    // Handle drop of elements/pages onto canvas
    const handleDrop = (e: DragEvent) => {
      if (!e.dataTransfer || e.dataTransfer.items.length === 0) return;
      if (disableHotkeys) return;

      const firstItem = e.dataTransfer.items[0];
      if (firstItem && firstItem.kind === 'string' && firstItem.type === 'text/plain') {
        firstItem.getAsString((text) => {
          if (disableHotkeys) return;
          if (!onTextDrop) return;
          // Convert drop point (screen coords) → canvas coords using the
          // viewport element's bounding rect and the current canvas scale.
          const viewport = viewportRef.current;
          if (!viewport) return;
          const rect = viewport.getBoundingClientRect();
          const canvasX = (e.clientX - rect.x) / canvasScale;
          const canvasY = (e.clientY - rect.y) / canvasScale;
          onTextDrop(canvasX, canvasY, text);
        });
      }
    };

    const preventDefault = (e: DragEvent) => e.preventDefault();

    if (element) {
      element.addEventListener('drop', handleDrop);
    }

    document.addEventListener('dragleave', preventDefault);
    document.addEventListener('drop', preventDefault);
    document.addEventListener('dragenter', preventDefault);
    document.addEventListener('dragover', preventDefault);

    return () => {
      if (element) {
        element.removeEventListener('drop', handleDrop);
      }

      document.removeEventListener('dragleave', preventDefault);
      document.removeEventListener('drop', preventDefault);
      document.removeEventListener('dragenter', preventDefault);
      document.removeEventListener('dragover', preventDefault);
    };
  }, [elementRef, viewportRef, canvasScale, disableHotkeys, onTextDrop]);
}
