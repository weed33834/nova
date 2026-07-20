// @vitest-environment jsdom
/**
 * Unit tests for the ErrorBoundary component.
 *
 * The project does not install @testing-library/react, so we drive the
 * component directly with react-dom/client's `createRoot` + React's `act`
 * helper. The i18n hook is mocked to return the raw key, the Button module
 * is replaced with a thin passthrough <button>, lucide-react icons are
 * stubbed, and `sonner`'s toast is replaced with a vi.fn so the copy
 * handler can be exercised without touching the real clipboard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en-US', setLocale: () => undefined }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: (props: ComponentProps<'button'>) =>
    createElement('button', props),
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: () => createElement('svg', { 'data-testid': 'icon-alert-triangle' }),
  RotateCcw: () => createElement('svg', { 'data-testid': 'icon-rotate-ccw' }),
  RefreshCw: () => createElement('svg', { 'data-testid': 'icon-refresh-cw' }),
  Copy: () => createElement('svg', { 'data-testid': 'icon-copy' }),
  Check: () => createElement('svg', { 'data-testid': 'icon-check' }),
  Bug: () => createElement('svg', { 'data-testid': 'icon-bug' }),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import { ErrorBoundary } from '@/components/ui/error-boundary';

let container: HTMLDivElement;
let root: Root;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs the caught error + component stack via console.error; silence it
  // so the test output isn't polluted by expected errors thrown by our Probe.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  consoleErrorSpy.mockRestore();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function render(node: ReactNode) {
  act(() => {
    root.render(node);
  });
}

/** Child component that throws synchronously during render. */
function Thrower({ error }: { error: Error }): ReactNode {
  throw error;
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      createElement(ErrorBoundary, null,
        createElement('div', null, 'Hello World'),
      ),
    );
    expect(container.textContent).toContain('Hello World');
  });

  it('renders the default fallback UI when a child throws', () => {
    const error = new Error('Test error message');
    render(
      createElement(ErrorBoundary, null,
        createElement(Thrower, { error }),
      ),
    );
    // The fallback uses an alert role so screen readers announce it.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    // Localized title / description come from the i18n mock.
    expect(container.textContent).toContain('errors.somethingWentWrong');
    expect(container.textContent).toContain('errors.somethingWentWrongDesc');
    // The error message is rendered inside the collapsible details block.
    expect(container.textContent).toContain('Test error message');
  });

  it('renders a "Reload page" button in the fallback UI', () => {
    render(
      createElement(ErrorBoundary, null,
        createElement(Thrower, { error: new Error('boom') }),
      ),
    );
    expect(container.textContent).toContain('errors.reloadPage');
    // Locate the reload button by the icon it renders so the test is robust
    // against button reordering.
    const buttons = Array.from(container.querySelectorAll('button'));
    const reloadButton = buttons.find((b) =>
      b.querySelector('[data-testid="icon-refresh-cw"]'),
    );
    expect(reloadButton).toBeDefined();
    expect(reloadButton!.textContent).toContain('errors.reloadPage');
  });

  it('renders a collapsible "Copy error info" button with the error stack', () => {
    const error = new Error('boom!');
    error.stack = 'Error: boom!\n    at thrower (test.ts:1:1)';
    render(
      createElement(ErrorBoundary, null,
        createElement(Thrower, { error }),
      ),
    );

    // The copy button is rendered.
    expect(container.textContent).toContain('errors.copyError');
    const buttons = Array.from(container.querySelectorAll('button'));
    const copyButton = buttons.find((b) =>
      b.querySelector('[data-testid="icon-copy"]'),
    );
    expect(copyButton).toBeDefined();
    expect(copyButton!.textContent).toContain('errors.copyError');

    // The error details are wrapped in a collapsible <details> element.
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    // The error message + stack trace are pre-formatted inside <pre>.
    const pre = details!.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain('boom!');
    expect(pre!.textContent).toContain('at thrower (test.ts:1:1)');
  });

  it('renders a custom fallback when the `fallback` prop is provided', () => {
    const customFallback = createElement(
      'div',
      { 'data-testid': 'custom-fallback' },
      'Custom fallback UI',
    );
    render(
      createElement(ErrorBoundary, { fallback: customFallback },
        createElement(Thrower, { error: new Error('ignored') }),
      ),
    );
    expect(container.querySelector('[data-testid="custom-fallback"]')).not.toBeNull();
    expect(container.textContent).toContain('Custom fallback UI');
    // The default fallback must NOT be rendered when a custom one is supplied.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('errors.somethingWentWrong');
  });
});
