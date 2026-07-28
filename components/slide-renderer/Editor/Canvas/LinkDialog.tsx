'use client';

/* eslint-disable react-hooks/set-state-in-effect -- dialog needs to sync its field state from the targeted element's existing link when it opens */

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { useStageStore } from '@/lib/store';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import type { PPTElement, PPTElementLink, ElementLinkType, SlideContent } from '@nova/dsl';

export interface LinkDialogProps {
  /** When non-null, the dialog is open and targets this element. */
  elementId: string | null;
  onClose: () => void;
}

type LinkMode = 'none' | ElementLinkType;

export function LinkDialog({ elementId, onClose }: LinkDialogProps) {
  const { updateElement, removeElementProps } = useCanvasOperations();
  const scenes = useStageStore.use.scenes();

  // Read the current slide's elements to find the targeted element and its
  // existing link value for pre-fill.
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas?.elements ?? [],
  );

  const slideScenes = useMemo(
    () =>
      scenes
        .filter((s) => s.type === 'slide')
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ id: s.id, title: s.title, order: s.order })),
    [scenes],
  );

  const targetElement = useMemo(
    () => (elementId ? elements.find((el) => el.id === elementId) : null) ?? null,
    [elementId, elements],
  );
  const existingLink = targetElement?.link;

  const [mode, setMode] = useState<LinkMode>('none');
  const [webUrl, setWebUrl] = useState('');
  const [slideTarget, setSlideTarget] = useState('');

  // Pre-fill from the element's existing link whenever the targeted element changes.
  useEffect(() => {
    if (!elementId) return;
    if (existingLink) {
      setMode(existingLink.type);
      if (existingLink.type === 'web') {
        setWebUrl(existingLink.target);
        setSlideTarget('');
      } else {
        setSlideTarget(existingLink.target);
        setWebUrl('');
      }
    } else {
      setMode('none');
      setWebUrl('');
      setSlideTarget('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init when the target element changes
  }, [elementId]);

  const open = elementId !== null;

  const handleConfirm = () => {
    if (!elementId) return;

    if (mode === 'none') {
      removeElementProps({ id: elementId, propName: 'link' });
      onClose();
      return;
    }

    let link: PPTElementLink | null = null;
    if (mode === 'web') {
      const trimmed = webUrl.trim();
      if (!trimmed) return;
      // Normalize bare URLs (e.g. "example.com") to https://.
      const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      link = { type: 'web', target: normalized };
    } else if (mode === 'slide') {
      if (!slideTarget) return;
      link = { type: 'slide', target: slideTarget };
    }

    if (link) {
      updateElement({ id: elementId, props: { link } });
    }
    onClose();
  };

  const canConfirm =
    mode === 'none' ||
    (mode === 'web' && webUrl.trim().length > 0) ||
    (mode === 'slide' && slideTarget.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>设置链接</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            点击此元素时跳转到的目标。可选择外部网页或本演示中的其他幻灯片。
          </p>

          <Tabs value={mode} onValueChange={(v) => setMode(v as LinkMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="none">无</TabsTrigger>
              <TabsTrigger value="web">网页</TabsTrigger>
              <TabsTrigger value="slide">幻灯片</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === 'web' && (
            <div className="space-y-2">
              <Label htmlFor="link-web-url">URL</Label>
              <Input
                id="link-web-url"
                placeholder="https://example.com"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirm) handleConfirm();
                }}
                autoFocus
              />
            </div>
          )}

          {mode === 'slide' && (
            <div className="space-y-2">
              <Label>目标幻灯片</Label>
              {slideScenes.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前演示中没有幻灯片场景。</p>
              ) : (
                <Select value={slideTarget} onValueChange={setSlideTarget}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择一张幻灯片" />
                  </SelectTrigger>
                  <SelectContent>
                    {slideScenes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.order}. {s.title || '未命名幻灯片'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {mode === 'none' && (
            <p className="text-sm text-muted-foreground">
              {existingLink ? '将移除当前元素上的链接。' : '当前元素没有链接。'}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
