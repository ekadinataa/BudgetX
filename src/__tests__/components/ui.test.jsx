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
    expect(error).toHaveClass('fieldError');
    expect(error).toHaveAttribute('role', 'alert');
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

  it('applies an inline style override', () => {
    render(<Input style={{ width: 200 }} data-testid="inp" />);
    expect(screen.getByTestId('inp').style.width).toBe('200px');
  });

  it('carries the shared inputField class', () => {
    // The base look moved from an inline style into `.inputField` in
    // base.css. That matters for layout: the inline version had no
    // `min-height`, so an input rendered 39–41px next to 32px buttons and
    // 44px full-size ones. `.inputField` sets `min-height: var(--tap)`, which
    // is what makes a toolbar row line up. Assert the class, since jsdom does
    // not apply base.css and cannot check the height itself.
    render(<Input data-testid="inp" />);
    expect(screen.getByTestId('inp')).toHaveClass('inputField');
  });

  it('appends a caller class alongside inputField', () => {
    render(<Input className="allocInput" data-testid="inp" />);
    const inp = screen.getByTestId('inp');
    expect(inp).toHaveClass('inputField');
    expect(inp).toHaveClass('allocInput');
  });

  it('emits no inline background, so a class can own the theme', () => {
    render(<Input data-testid="inp" />);
    // An inline background would beat any class on specificity, which is how
    // `.allocInput` used to be unable to set its own width or background.
    expect(screen.getByTestId('inp').getAttribute('style')).toBeNull();
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

  it('applies an inline style override', () => {
    render(
      <Select style={{ width: 300 }} data-testid="sel">
        <option>X</option>
      </Select>
    );
    expect(screen.getByTestId('sel').style.width).toBe('300px');
  });

  it('carries the shared inputField class', () => {
    // See the Input test above: `.inputField` supplies `min-height: var(--tap)`,
    // so a select lines up with buttons in the same row.
    render(
      <Select data-testid="sel">
        <option>X</option>
      </Select>
    );
    expect(screen.getByTestId('sel')).toHaveClass('inputField');
  });

  it('emits no inline background, so a class can own the theme', () => {
    render(
      <Select data-testid="sel">
        <option>X</option>
      </Select>
    );
    expect(screen.getByTestId('sel').getAttribute('style')).toBeNull();
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
    // Token, not a literal: the overflow colour must track the theme.
    expect(bar.style.background).toBe('var(--red)');
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
