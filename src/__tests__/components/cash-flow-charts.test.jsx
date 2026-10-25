import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CashFlowTrend from '../../components/charts/CashFlowTrend';
import CashFlowWaterfall from '../../components/charts/CashFlowWaterfall';

const values = [{ key: '2026-10', label: 'Okt 26', income: 1000, expense: 1500 }];

describe('cash-flow charts', () => {
  it('shows a real empty state, not invented bars or points', () => {
    render(<><CashFlowTrend values={[]} /><CashFlowWaterfall transactions={[]} /></>);
    expect(screen.getAllByText(/Belum ada/)).toHaveLength(2);
    expect(document.querySelectorAll('.point, .waterfall span')).toHaveLength(0);
  });
  it('renders finite geometry for a single zero-valued period', () => {
    const { container } = render(<CashFlowTrend values={[{ ...values[0], income: 0, expense: 0 }]} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(container.querySelector('.point')).toHaveAttribute('cx', '360');
  });
  it('supports keyboard tooltip, Escape and blur dismissal', () => {
    render(<CashFlowTrend values={values} />);
    const point = screen.getByRole('img');
    fireEvent.focus(point);
    expect(screen.getByRole('status')).toHaveTextContent('Masuk Rp1.000 · Keluar Rp1.500');
    fireEvent.keyDown(point, { key: 'Escape' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.focus(point);
    fireEvent.blur(point);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('supports pointer tooltip and mouse-leave dismissal', () => {
    render(<CashFlowTrend values={values} />);
    const point = screen.getByRole('img');
    fireEvent.mouseEnter(point);
    expect(screen.getByRole('status')).toHaveTextContent('Okt 26');
    fireEvent.mouseLeave(point);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('encodes negative net days without counting transfers or adjustments', () => {
    render(<CashFlowWaterfall transactions={[{ date: '2026-10-01', type: 'expense', amount: 10 }, { date: '2026-10-02', type: 'transfer', amount: 20 }, { date: '2026-10-03', type: 'adjustment', amount: 30 }]} />);
    expect(document.querySelectorAll('.waterfall span')).toHaveLength(1);
    expect(document.querySelector('.waterfall span')).toHaveClass('out');
  });
});
