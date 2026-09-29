import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import ProgressBar from '../../components/ui/ProgressBar';
import TxBadge from '../../components/ui/TxBadge';
import AmountText from '../../components/ui/AmountText';
import SectionPill from '../../components/ui/SectionPill';

describe('Field', () => {
  it('renders label and children', () => {
    render(
      <Field label="Nama">
        <input data-testid="child" />
      </Field>
    );
    expect(screen.getByText('Nama')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders error message in red when provided', () => {
    render(
      <Field label="Jumlah" error="Wajib diisi">
        <input />
      </Field>
    );
    const error = screen.getByText('Wajib diisi');
    expect(error).toBeInTheDocument();
    // jsdom normalizes hex to rgb
    expect(error.style.color).toBe('rgb(239, 68, 68)');
  });

  it('does not render error element when no error', () => {
    render(
      <Field label="Catatan">
        <input />
      </Field>
    );
    expect(screen.queryByText(/./i, { selector: 'div[style*="color"]' })).toBeNull();
  });
});

describe('Input', () => {
  it('renders an input element with theme-aware styles', () => {
    render(<Input placeholder="Masukkan nama" data-testid="inp" />);
    const inp = screen.getByTestId('inp');
    expect(inp.tagName).toBe('INPUT');
    expect(inp.placeholder).toBe('Masukkan nama');
  });

  it('merges custom style with base styles', () => {
    render(<Input style={{ width: 200 }} data-testid="inp" />);
    const inp = screen.getByTestId('inp');
    // Custom style wins over the base
    expect(inp.style.width).toBe('200px');
    // Base styles survive the merge
    expect(inp.style.fontSize).toBe('14px');
    expect(inp.style.background).toContain('var(--bg-2)');
  });
});

describe('Select', () => {
  it('renders a select element with options', () => {
    render(
      <Select data-testid="sel">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );
    const sel = screen.getByTestId('sel');
    expect(sel.tagName).toBe('SELECT');
    expect(sel.options.length).toBe(2);
  });

  it('merges custom style with base styles', () => {
    render(
      <Select style={{ width: 300 }} data-testid="sel">
        <option>X</option>
      </Select>
    );
    const sel = screen.getByTestId('sel');
    expect(sel.style.width).toBe('300px');
    // Base styles survive the merge
    expect(sel.style.fontSize).toBe('14px');
    expect(sel.style.background).toContain('var(--bg-2)');
  });
});

describe('ProgressBar', () => {
  // Helper to get the inner bar element (the fill div inside the track div)
  const getBar = (container) => {
    const track = container.firstChild;
    return track.firstChild;
  };

  it('renders bar at correct percentage', () => {
    const { container } = render(
      <ProgressBar value={50} max={100} color="#22C55E" />
    );
    const bar = getBar(container);
    expect(bar.style.width).toBe('50%');
    expect(bar.style.background).toBe('rgb(34, 197, 94)');
  });

  it('caps bar at 100% when value exceeds max', () => {
    const { container } = render(
      <ProgressBar value={150} max={100} color="#4F6EF7" />
    );
    const bar = getBar(container);
    expect(bar.style.width).toBe('100%');
  });

  it('turns red when showOverflow is true and value > max', () => {
    const { container } = render(
      <ProgressBar value={150} max={100} color="#4F6EF7" showOverflow />
    );
    const bar = getBar(container);
    expect(bar.style.background).toBe('rgb(239, 68, 68)');
  });

  it('keeps original color when showOverflow is true but value <= max', () => {
    const { container } = render(
      <ProgressBar value={80} max={100} color="#22C55E" showOverflow />
    );
    const bar = getBar(container);
    expect(bar.style.background).toBe('rgb(34, 197, 94)');
  });

  it('renders 0% width when max is 0', () => {
    const { container } = render(
      <ProgressBar value={50} max={0} color="#4F6EF7" />
    );
    const bar = getBar(container);
    expect(bar.style.width).toBe('0%');
  });
});

describe('TxBadge', () => {
  it('renders "Pemasukan" for income type', () => {
    render(<TxBadge type="income" />);
    expect(screen.getByText('Pemasukan')).toBeInTheDocument();
  });

  it('renders "Pengeluaran" for expense type', () => {
    render(<TxBadge type="expense" />);
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
  });

  it('renders "Transfer" for transfer type', () => {
    render(<TxBadge type="transfer" />);
    expect(screen.getByText('Transfer')).toBeInTheDocument();
  });

  it('falls back to expense style for unknown type', () => {
    render(<TxBadge type="unknown" />);
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
  });
});

describe('AmountText', () => {
  it('renders income with + prefix', () => {
    render(<AmountText type="income" amount={500000} />);
    const text = screen.getByText(/\+/);
    expect(text).toBeInTheDocument();
    expect(text.textContent).toContain('Rp');
  });

  it('renders expense with - prefix', () => {
    render(<AmountText type="expense" amount={250000} />);
    const text = screen.getByText(/-/);
    expect(text).toBeInTheDocument();
  });

  it('renders transfer with ↔ prefix', () => {
    render(<AmountText type="transfer" amount={100000} />);
    const text = screen.getByText(/↔/);
    expect(text).toBeInTheDocument();
  });

  it('applies custom font size', () => {
    const { container } = render(
      <AmountText type="income" amount={1000} size={20} />
    );
    const span = container.querySelector('span');
    expect(span.style.fontSize).toBe('20px');
  });
});

describe('SectionPill', () => {
  it('renders "Kebutuhan" for needs section', () => {
    render(<SectionPill section="needs" />);
    expect(screen.getByText('Kebutuhan')).toBeInTheDocument();
  });

  it('renders "Keinginan" for wants section', () => {
    render(<SectionPill section="wants" />);
    expect(screen.getByText('Keinginan')).toBeInTheDocument();
  });

  it('renders "Tabungan" for savings section', () => {
    render(<SectionPill section="savings" />);
    expect(screen.getByText('Tabungan')).toBeInTheDocument();
  });
});
