import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar, { NAV_GROUPS } from '../../components/Sidebar/Sidebar.jsx';

const ALL_LABELS = NAV_GROUPS.flatMap((g) => g.items);

const defaultProps = {
  page: 'dashboard',
  setPage: vi.fn(),
  darkMode: false,
  setDarkMode: vi.fn(),
  collapsed: false,
  onToggleCollapse: vi.fn(),
};

describe('Sidebar', () => {
  it('renders BudgetX branding with logo and subtitle', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('BudgetX')).toBeInTheDocument();
    expect(screen.getByText('Money Tracker')).toBeInTheDocument();
  });

  it('renders every navigation destination exactly once', () => {
    render(<Sidebar {...defaultProps} />);
    for (const id of ALL_LABELS) {
      const btn = document.querySelector(`.navItem[data-page="${id}"]`);
      expect(btn, `nav item ${id} missing`).toBeTruthy();
    }
  });

  it('groups the navigation into the four reference sections', () => {
    render(<Sidebar {...defaultProps} />);
    const groups = [...document.querySelectorAll('.navGroupLabel')].map((n) => n.textContent);
    expect(groups).toEqual(['Ringkasan', 'Komitmen', 'Aset', 'Analisa']);
  });

  it('keeps the help page reachable under Analisa', () => {
    expect(NAV_GROUPS.find((g) => g.label === 'Analisa').items).toContain('help');
  });

  it('marks the active item with navItemActive and aria-current', () => {
    render(<Sidebar {...defaultProps} page="wallet" />);
    const active = document.querySelector('.navItemActive');
    expect(active).toBeTruthy();
    expect(active.getAttribute('data-page')).toBe('wallet');
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('calls setPage when a navigation item is clicked', () => {
    const setPage = vi.fn();
    render(<Sidebar {...defaultProps} setPage={setPage} />);
    fireEvent.click(document.querySelector('.navItem[data-page="tx"]'));
    expect(setPage).toHaveBeenCalledWith('tx');
  });

  it('offers a theme toggle labelled with the mode it switches to', () => {
    const { unmount } = render(<Sidebar {...defaultProps} darkMode={false} />);
    expect(screen.getByText('Mode gelap')).toBeInTheDocument();
    unmount();
    render(<Sidebar {...defaultProps} darkMode={true} />);
    expect(screen.getByText('Mode terang')).toBeInTheDocument();
  });

  it('toggles the theme on click', () => {
    const setDarkMode = vi.fn();
    render(<Sidebar {...defaultProps} setDarkMode={setDarkMode} />);
    fireEvent.click(screen.getByText('Mode gelap'));
    expect(setDarkMode).toHaveBeenCalledTimes(1);
  });

  it('exposes a collapse control and reports its state', () => {
    const onToggleCollapse = vi.fn();
    const { unmount } = render(
      <Sidebar {...defaultProps} collapsed={false} onToggleCollapse={onToggleCollapse} />
    );
    fireEvent.click(screen.getByText('Ciutkan'));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    unmount();
    render(<Sidebar {...defaultProps} collapsed onToggleCollapse={onToggleCollapse} />);
    expect(screen.getByText('Perluas')).toBeInTheDocument();
  });

  it('shows the signed-in user in the footer', () => {
    render(<Sidebar {...defaultProps} user={{ email: 'raka@budgetx.id' }} />);
    expect(screen.getByText('raka@budgetx.id')).toBeInTheDocument();
  });

  // ── Collapsed rail ────────────────────────────────────────────────
  //
  // Two bugs shipped here once and are cheap to reintroduce, because the
  // failing state is invisible to jsdom — it never applies base.css:
  //   1. `[data-collapsed='true'] .sidebarAction span { display: none }` is a
  //      blanket selector lifted from the reference. It works there only
  //      because the reference keeps the icon *outside* any span. Wrapping the
  //      icon in <span class="navIcon"> made the rule hide the icons too, so
  //      all three footer buttons rendered blank at 72px.
  //   2. The reference never hides .navGroupLabel when collapsed, so
  //      "RINGKASAN" / "KOMITMEN" / "ANALISA" render inside the 72px rail and
  //      clip mid-word.
  //
  // These assert the markup/CSS contract instead of a rendered result, so they
  // still run without a real stylesheet.
  //
  // Paths are resolved from this file: src/__tests__/components -> ../.. = src.

  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const sidebarSource = () =>
    readFileSync(resolve(SRC, 'components', 'Sidebar', 'Sidebar.jsx'), 'utf-8');
  const baseCss = () => readFileSync(resolve(SRC, 'styles', 'base.css'), 'utf-8');

  it('labels footer text so the collapsed hide rule cannot eat the icons', () => {
    const blocks = sidebarSource().match(
      /className="sidebarAction"[\s\S]{0,600}?<\/button>/g,
    );
    expect(blocks).not.toBeNull();
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      // The text span is explicitly classed...
      expect(block).toContain('className="sidebarActionLabel"');
      // ...and the icon span is the only one left, so the blanket rule (if it
      // ever came back) would still be a regression.
      const bareSpans = block.match(/<span>/g) || [];
      expect(bareSpans).toHaveLength(0);
    }
  });

  it('wraps each nav group so a collapsed separator can target it', () => {
    expect(sidebarSource()).toContain('className="navGroup"');
  });

  it('hides the group labels when collapsed', () => {
    expect(baseCss()).toMatch(
      /\[data-collapsed='true'\] \.navGroupLabel\s*\{[^}]*font-size:\s*0/,
    );
    expect(baseCss()).toMatch(/\[data-collapsed='true'\] \.navGroup ~ \.navGroup/);
  });

  it('does not hide sidebar icons via a blanket span selector', () => {
    expect(baseCss()).not.toMatch(
      /\[data-collapsed='true'\][^}]*\.sidebarAction span\s*\{/,
    );
  });

  it('renders a logout action only when a handler is supplied', () => {
    const { unmount } = render(<Sidebar {...defaultProps} />);
    expect(screen.queryByText('Keluar')).toBeNull();
    unmount();
    render(<Sidebar {...defaultProps} onLogout={vi.fn()} />);
    expect(screen.getByText('Keluar')).toBeInTheDocument();
  });
});
