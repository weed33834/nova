// @vitest-environment jsdom
/**
 * Unit tests for the CourseFormatSelector component.
 *
 * The project does not install @testing-library/react, so we drive the
 * component directly with react-dom/client's `createRoot` + React's `act`
 * helper. The i18n hook is mocked to return the raw key so the rendered
 * text reliably contains the suffix the assertions look for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en-US', setLocale: () => undefined }),
}));

import { CourseFormatSelector } from '@/components/generation/course-format-selector';

type Props = ComponentProps<typeof CourseFormatSelector>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // React 19 looks for this flag to know it is running inside a test runner
  // that flushes effects synchronously via `act`. Without it React prints a
  // "Current testing environment is not configured to support act(...)" warning.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function renderSelector(props: Partial<Props> = {}): Props {
  const fullProps: Props = {
    value: 'video',
    onChange: vi.fn(),
    ...props,
  };
  act(() => {
    root.render(createElement(CourseFormatSelector, fullProps));
  });
  return fullProps;
}

function getTriggerButton(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
  if (!btn) throw new Error('trigger button (aria-haspopup="listbox") was not rendered');
  return btn;
}

function getListbox(): HTMLElement | null {
  return container.querySelector('[role="listbox"]');
}

function getOptions(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="option"]'));
}

function click(node: Node) {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

function clickOutside() {
  act(() => {
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
  });
}

describe('CourseFormatSelector', () => {
  it('renders the current video label by default', () => {
    renderSelector();
    expect(getTriggerButton().textContent).toContain('courseFormatVideo');
  });

  it('opens the dropdown menu when the trigger button is clicked', () => {
    renderSelector();
    expect(getListbox()).toBeNull();
    click(getTriggerButton());
    expect(getListbox()).not.toBeNull();
    expect(getTriggerButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('shows exactly three options (video / ppt-audio / text-only)', () => {
    renderSelector();
    click(getTriggerButton());
    const options = getOptions();
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain('courseFormatVideo');
    expect(options[1].textContent).toContain('courseFormatPptAudio');
    expect(options[2].textContent).toContain('courseFormatTextOnly');
  });

  it('calls onChange("ppt-audio") and closes the menu when the ppt-audio option is clicked', () => {
    const onChange = vi.fn();
    renderSelector({ onChange });
    click(getTriggerButton());
    const options = getOptions();
    click(options[1]);
    expect(onChange).toHaveBeenCalledWith('ppt-audio');
    expect(getListbox()).toBeNull();
  });

  it('calls onChange("text-only") and closes the menu when the text-only option is clicked', () => {
    const onChange = vi.fn();
    renderSelector({ onChange });
    click(getTriggerButton());
    const options = getOptions();
    click(options[2]);
    expect(onChange).toHaveBeenCalledWith('text-only');
    expect(getListbox()).toBeNull();
  });

  it('closes the menu when the Escape key is pressed', () => {
    renderSelector();
    click(getTriggerButton());
    expect(getListbox()).not.toBeNull();
    pressEscape();
    expect(getListbox()).toBeNull();
  });

  it('closes the menu when clicking outside of the selector', () => {
    renderSelector();
    click(getTriggerButton());
    expect(getListbox()).not.toBeNull();
    clickOutside();
    expect(getListbox()).toBeNull();
  });

  it('shows a checkmark on the currently selected option', () => {
    renderSelector({ value: 'ppt-audio' });
    click(getTriggerButton());
    const options = getOptions();
    expect(options[0].getAttribute('aria-selected')).toBe('false');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(options[2].getAttribute('aria-selected')).toBe('false');
    // The checkmark is rendered as the lucide-check svg.
    expect(options[1].querySelector('svg.lucide-check')).not.toBeNull();
    // Non-selected options must not have the checkmark.
    expect(options[0].querySelector('svg.lucide-check')).toBeNull();
    expect(options[2].querySelector('svg.lucide-check')).toBeNull();
  });

  it('exposes correct ARIA attributes on the trigger, listbox, and options', () => {
    renderSelector();
    const button = getTriggerButton();
    // Trigger button ARIA contract
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    click(getTriggerButton());

    // Trigger reflects expanded state once the menu is open.
    expect(button.getAttribute('aria-expanded')).toBe('true');

    const listbox = getListbox();
    expect(listbox).not.toBeNull();
    expect(listbox!.getAttribute('role')).toBe('listbox');

    const options = getOptions();
    expect(options).toHaveLength(3);
    options.forEach((option) => {
      expect(option.getAttribute('role')).toBe('option');
    });
    // Exactly one option (the currently selected value) reports aria-selected="true".
    const selected = options.filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });
});
