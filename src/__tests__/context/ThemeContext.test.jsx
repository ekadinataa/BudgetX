import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';

/** Helper component that consumes the theme context */
function ThemeConsumer() {
  const { darkMode, setDarkMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{darkMode ? 'dark' : 'light'}</span>
      <button onClick={() => setDarkMode((prev) => !prev)}>toggle</button>
    </div>
  );
}

const attr = () => document.documentElement.getAttribute.bind(document.documentElement);

describe('ThemeContext', () => {
  it('provides darkMode value to consumers', () => {
    render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()}>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });

  it('provides darkMode=true to consumers', () => {
    render(
      <ThemeProvider darkMode={true} setDarkMode={vi.fn()}>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId('mode').textContent).toBe('dark');
  });

  it('does NOT inject inline CSS custom properties', () => {
    // Colours live in src/styles/tokens.css. Injecting them inline would pin
    // them as inline styles and defeat the stylesheet, so the provider must
    // only ever write data attributes.
    render(
      <ThemeProvider darkMode={true} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(document.documentElement.style.length).toBe(0);
  });

  it('sets data-theme="dark" when darkMode is true', () => {
    render(
      <ThemeProvider darkMode={true} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-theme')).toBe('dark');
  });

  it('sets data-theme="light" when darkMode is false', () => {
    // Unlike the previous token system, light is an explicit value rather than
    // "attribute absent": the reference styles dark through
    // :root[data-theme='dark'] and the FOUC script always writes the attribute.
    render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-theme')).toBe('light');
  });

  it('toggles the attribute when darkMode changes', () => {
    const { rerender } = render(
      <ThemeProvider darkMode={true} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-theme')).toBe('dark');
    rerender(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-theme')).toBe('light');
  });

  it('writes the density preset', () => {
    render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()} density="compact">
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-density')).toBe('compact');
  });

  it('defaults density to standard and radius to soft', () => {
    render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-density')).toBe('standard');
    expect(attr()('data-radius')).toBe('soft');
  });

  it('writes the radius preset', () => {
    render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()} radius="round">
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-radius')).toBe('round');
  });

  it('sets data-collapsed only while collapsed', () => {
    const { rerender } = render(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()} collapsed>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-collapsed')).toBe('true');
    rerender(
      <ThemeProvider darkMode={false} setDarkMode={vi.fn()} collapsed={false}>
        <div>child</div>
      </ThemeProvider>
    );
    expect(attr()('data-collapsed')).toBeNull();
  });

  it('calls setDarkMode when consumer triggers toggle', () => {
    const setDarkMode = vi.fn();
    render(
      <ThemeProvider darkMode={false} setDarkMode={setDarkMode}>
        <ThemeConsumer />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('toggle'));
    expect(setDarkMode).toHaveBeenCalledTimes(1);
  });

  it('throws when useTheme is used outside ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeConsumer />)).toThrow(
      'useTheme must be used within a ThemeProvider'
    );
    spy.mockRestore();
  });
});
