'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useKeyboardStore } from '@/lib/store/keyboard';
import { useViewportSize } from './hooks/useViewportSize';
import { useSelectElement } from './hooks/useSelectElement';
import { useDragElement } from './hooks/useDragElement';
import { useRotateElement } from './hooks/useRotateElement';
import { useMouseSelection } from './hooks/useMouseSelection';
import { useScaleElement } from './hooks/useScaleElement';
import { useDragLineElement } from './hooks/useDragLineElement';
import { useMoveShapeKeypoint } from './hooks/useMoveShapeKeypoint';
import { useInsertFromCreateSelection } from './hooks/useInsertFromCreateSelection';
import { useDrop } from './hooks/useDrop';
import { AlignmentLine } from './AlignmentLine';
import { MouseSelection } from './MouseSelection';
import { ViewportBackground } from './ViewportBackground';
import { EditableElement } from './EditableElement';
import { Operate } from './Operate';
import { MultiSelectOperate } from './Operate/MultiSelectOperate';
import { ElementCreateSelection } from './ElementCreateSelection';
import { ShapeCreateCanvas } from './ShapeCreateCanvas';
import { Ruler } from './Ruler';
import { GridLines } from './GridLines';
import { LinkDialog } from './LinkDialog';
import type { PPTElement, PPTTextElement, PPTShapeElement } from '@nova/dsl';
import type { AlignmentLineProps } from '@/lib/types/edit';
import type { ContextmenuItem } from './EditableElement';
import type { SlideContent } from '@/lib/types/stage';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import { createElementId } from '@/lib/edit/element-id';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuShortcut,
  ContextMenuItem,
} from '@/components/ui/context-menu';

export interface CanvasProps {
  editable?: boolean;
}

/**
 * Canvas component
 *
 * Architecture:
 * - Slide data (elements, background) → Scene Context (from stageStore)
 * - Local element list → useRef + useState (for drag/scale/rotate operations)
 * - Canvas UI state (selection, toolbar) → Canvas Store
 * - Keyboard state → Keyboard Store
 *
 * Usage:
 * <SceneProvider>
 *   <Canvas />
 * </SceneProvider>
 */
export function Canvas(_props: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Subscribe to specific parts for performance optimization
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );

  // Canvas UI state
  const canvasScale = useCanvasStore.use.canvasScale();
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const handleElementId = useCanvasStore.use.handleElementId();
  const hiddenElementIdList = useCanvasStore.use.hiddenElementIdList();
  const creatingElement = useCanvasStore.use.creatingElement();
  const creatingCustomShape = useCanvasStore.use.creatingCustomShape();
  const showRuler = useCanvasStore.use.showRuler();
  const gridLineSize = useCanvasStore.use.gridLineSize();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const setGridLineSize = useCanvasStore.use.setGridLineSize();
  const setRulerState = useCanvasStore.use.setRulerState();

  // Keyboard state
  const spaceKeyState = useKeyboardStore((state) => state.spaceKeyState);

  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([]);
  const [linkDialogElementId, setLinkDialogElementId] = useState<string | null>(null);

  // Local element list for drag/scale/rotate operations
  const elementListRef = useRef<PPTElement[]>(elements || []);
  const [elementList, setElementList] = useState<PPTElement[]>(elements || []);

  // Sync store elements to local state
  useEffect(() => {
    const newElements = elements ? JSON.parse(JSON.stringify(elements)) : [];
    elementListRef.current = newElements;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync store elements to local state
    setElementList(newElements);
  }, [elements]);

  // Viewport size and positioning
  const { viewportStyles, dragViewport } = useViewportSize(canvasRef);

  // Canvas operations (must be declared before callbacks that use addElement,
  // otherwise the const would be referenced before its declaration.)
  const { pasteElement, selectAllElements, deleteAllElements, addElement } = useCanvasOperations();

  // Initialize drop handler — insert a text element when plain text is
  // dragged onto the canvas from outside (e.g. from another app).
  const handleTextDrop = useCallback(
    (canvasX: number, canvasY: number, text: string) => {
      const safeText = text.trim();
      if (!safeText) return;
      // Escape HTML-special characters so dropped text is treated as text,
      // not as HTML markup (prevents accidental markup injection).
      const escaped = safeText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const textEl: PPTTextElement = {
        id: createElementId('text'),
        type: 'text',
        left: canvasX - 150,
        top: canvasY - 30,
        width: 300,
        height: 60,
        rotate: 0,
        content: `<p>${escaped}</p>`,
        defaultFontName: '',
        defaultColor: '#333',
      };
      addElement(textEl);
    },
    [addElement],
  );
  useDrop(canvasRef, viewportRef, { onTextDrop: handleTextDrop });

  // Element drag (with alignment snapping)
  const { dragElement } = useDragElement(elementListRef, setElementList, setAlignmentLines);

  // Element selection
  const { selectElement } = useSelectElement(elementListRef, dragElement);

  // Mouse selection
  const { mouseSelection, mouseSelectionVisible, mouseSelectionQuadrant, updateMouseSelection } =
    useMouseSelection(elementListRef, viewportRef);

  // Element operations
  const { scaleElement, scaleMultiElement } = useScaleElement(
    elementListRef,
    setElementList,
    setAlignmentLines,
  );
  const { rotateElement } = useRotateElement(
    elementListRef,
    setElementList,
    viewportRef,
    canvasScale,
  );
  const { dragLineElement } = useDragLineElement(elementListRef, setElementList);
  const { moveShapeKeypoint } = useMoveShapeKeypoint(elementListRef, setElementList, canvasScale);

  // Create element from selection
  const { insertElementFromCreateSelection } = useInsertFromCreateSelection(viewportRef);

  // Click on blank canvas area: clear active elements
  const handleClickBlankArea = (e: React.MouseEvent) => {
    // Check if the click target is a context menu element (menu content in Portal)
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-slot="context-menu-content"]') ||
      target.closest('[data-slot="context-menu-sub-content"]') ||
      target.closest('[data-slot="context-menu-item"]') ||
      target.closest('[data-slot="context-menu-sub-trigger"]')
    ) {
      return; // Skip blank area handling if clicking on context menu
    }

    if (activeElementIdList.length) {
      setActiveElementIdList([]);
    }

    if (!spaceKeyState) {
      updateMouseSelection(e);
    } else {
      dragViewport(e);
    }
  };

  // Double-click blank area to insert text
  const handleDblClick = (e: React.MouseEvent) => {
    if (activeElementIdList.length || creatingElement || creatingCustomShape) return;
    if (!viewportRef.current) return;

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const left = (e.clientX - viewportRect.x) / canvasScale;
    const top = (e.clientY - viewportRect.y) / canvasScale;
    // Center the default text box on the click point
    const textEl: PPTTextElement = {
      id: createElementId('text'),
      type: 'text',
      left: left - 150,
      top: top - 30,
      width: 300,
      height: 60,
      rotate: 0,
      content: '<p style="text-align: center"><br></p>',
      defaultFontName: '',
      defaultColor: '#333',
    };
    addElement(textEl);
  };

  const openLinkDialog = (elementId: string) => {
    setLinkDialogElementId(elementId);
  };

  const contextmenus = (): ContextmenuItem[] => {
    return [
      {
        text: '粘贴',
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      {
        text: '全选',
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: '标尺',
        subText: showRuler ? '√' : '',
        handler: () => setRulerState(!showRuler),
      },
      {
        text: '网格线',
        handler: () => setGridLineSize(gridLineSize ? 0 : 50),
        children: [
          {
            text: '无',
            subText: gridLineSize === 0 ? '√' : '',
            handler: () => setGridLineSize(0),
          },
          {
            text: '小',
            subText: gridLineSize === 25 ? '√' : '',
            handler: () => setGridLineSize(25),
          },
          {
            text: '中',
            subText: gridLineSize === 50 ? '√' : '',
            handler: () => setGridLineSize(50),
          },
          {
            text: '大',
            subText: gridLineSize === 100 ? '√' : '',
            handler: () => setGridLineSize(100),
          },
        ],
      },
      {
        text: '重置当前页',
        handler: deleteAllElements,
      },
    ];
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="canvas relative h-full w-full overflow-hidden bg-gray-100 select-none"
          ref={canvasRef}
          onMouseDown={handleClickBlankArea}
          onDoubleClick={handleDblClick}
        >
          {/* Element creation selection */}
          {creatingElement && (
            <ElementCreateSelection onCreated={insertElementFromCreateSelection} />
          )}

          {/* Custom shape creation canvas */}
          {creatingCustomShape && (
            <ShapeCreateCanvas
              onCreated={(data) => {
                // Convert the custom-drawn shape's screen-space start/end
                // points into canvas coordinates, then insert a PPTShapeElement
                // carrying the user-drawn SVG path.
                const viewport = viewportRef.current;
                if (!viewport) return;
                const rect = viewport.getBoundingClientRect();
                const minX = Math.min(data.start[0], data.end[0]);
                const maxX = Math.max(data.start[0], data.end[0]);
                const minY = Math.min(data.start[1], data.end[1]);
                const maxY = Math.max(data.start[1], data.end[1]);
                const left = (minX - rect.x) / canvasScale;
                const top = (minY - rect.y) / canvasScale;
                const width = Math.max(20, (maxX - minX) / canvasScale);
                const height = Math.max(20, (maxY - minY) / canvasScale);
                const shapeEl: PPTShapeElement = {
                  id: createElementId('shape'),
                  type: 'shape',
                  left,
                  top,
                  width,
                  height,
                  rotate: 0,
                  viewBox: data.viewBox,
                  path: data.path,
                  fixedRatio: false,
                  fill: data.fill ?? '#5b9bd5',
                  ...(data.outline ? { outline: data.outline } : {}),
                };
                addElement(shapeEl);
              }}
            />
          )}

          {/* Viewport wrapper */}
          <div
            className="viewport-wrapper absolute shadow-[0_0_0_1px_rgba(0,0,0,0.01),0_0_12px_0_rgba(0,0,0,0.1)]"
            style={{
              width: `${viewportStyles.width * canvasScale}px`,
              height: `${viewportStyles.height * canvasScale}px`,
              left: `${viewportStyles.left}px`,
              top: `${viewportStyles.top}px`,
            }}
          >
            {/* Operations layer - alignment lines and selection handles */}
            <div className="operates absolute top-0 left-0 w-full h-full pointer-events-none">
              {/* Alignment lines */}
              {alignmentLines.map((line, index) => (
                <AlignmentLine
                  key={`${line.type}-${line.axis.x}-${line.axis.y}-${index}`}
                  type={line.type}
                  axis={line.axis}
                  length={line.length}
                  canvasScale={canvasScale}
                />
              ))}

              {/* Multi-select operations */}
              {activeElementIdList.length > 1 && (
                <MultiSelectOperate
                  elementList={elementList}
                  scaleMultiElement={scaleMultiElement}
                />
              )}

              {/* Single element operations */}
              {elementList.map(
                (element: PPTElement) =>
                  !hiddenElementIdList.includes(element.id) && (
                    <Operate
                      key={element.id}
                      elementInfo={element}
                      isSelected={activeElementIdList.includes(element.id)}
                      isActive={handleElementId === element.id}
                      isActiveGroupElement={activeGroupElementId === element.id}
                      isMultiSelect={activeElementIdList.length > 1}
                      rotateElement={rotateElement}
                      scaleElement={scaleElement}
                      dragLineElement={dragLineElement}
                      moveShapeKeypoint={moveShapeKeypoint}
                      openLinkDialog={openLinkDialog}
                    />
                  ),
              )}

              <ViewportBackground />
            </div>

            {/* Viewport - the actual slide canvas */}
            <div
              ref={viewportRef}
              className="viewport absolute top-0 left-0 origin-top-left"
              style={{
                width: `${viewportStyles.width}px`,
                height: `${viewportStyles.height}px`,
                transform: `scale(${canvasScale})`,
              }}
            >
              {/* Grid lines */}
              {gridLineSize > 0 && <GridLines />}

              {/* Mouse selection rectangle */}
              {mouseSelectionVisible && (
                <MouseSelection
                  top={mouseSelection.top}
                  left={mouseSelection.left}
                  width={mouseSelection.width}
                  height={mouseSelection.height}
                  quadrant={mouseSelectionQuadrant}
                  canvasScale={canvasScale}
                />
              )}

              {/* Render all elements */}
              {elementList.map((element: PPTElement, index: number) =>
                !hiddenElementIdList.includes(element.id) ? (
                  <EditableElement
                    key={element.id}
                    elementInfo={element}
                    elementIndex={index + 1}
                    isMultiSelect={activeElementIdList.length > 1}
                    selectElement={selectElement}
                    openLinkDialog={openLinkDialog}
                  />
                ) : null,
              )}
            </div>
          </div>

          {/* Ruler */}
          {showRuler && <Ruler viewportStyles={viewportStyles} elementList={elementList} />}

          {/* Drag mask when space key is pressed */}
          {spaceKeyState && <div className="drag-mask absolute inset-0 cursor-grab" />}

          <LinkDialog
            elementId={linkDialogElementId}
            onClose={() => setLinkDialogElementId(null)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {contextmenus().map((item, index) => {
          if (item.divider) {
            return <ContextMenuSeparator key={index} />;
          }

          // If has children, use submenu component
          if (item.children && item.children.length > 0) {
            return (
              <ContextMenuSub key={index}>
                <ContextMenuSubTrigger disabled={item.disable} hidden={item.hide}>
                  {item.text}
                  {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {item.children.map((child, childIndex) =>
                    child.divider ? (
                      <ContextMenuSeparator key={childIndex} />
                    ) : (
                      <ContextMenuItem
                        key={childIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          child.handler?.();
                        }}
                        disabled={child.disable}
                        hidden={child.hide}
                      >
                        {child.text}
                        {child.subText && (
                          <ContextMenuShortcut>{child.subText}</ContextMenuShortcut>
                        )}
                      </ContextMenuItem>
                    ),
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
            );
          }

          // Regular menu item
          return (
            <ContextMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                item.handler?.();
              }}
              disabled={item.disable}
              hidden={item.hide}
            >
              {item.text}
              {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default Canvas;
