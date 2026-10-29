import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Topbar from '../../components/Topbar/Topbar';
import LoginPage from '../../pages/Auth/LoginPage';
import RegisterPage from '../../pages/Auth/RegisterPage';
import ForgotPasswordPage from '../../pages/Auth/ForgotPasswordPage';

function expectReferenceWordmark() {
  const logo = screen.getByRole('img', { name: 'BudgetX', exact: true });
  expect(logo).toHaveClass('brandLogo');
  const variants = [...logo.querySelectorAll('img')];
  expect(variants).toHaveLength(2);
  for (const image of variants) {
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('width', '124');
    expect(image).toHaveAttribute('height', '30');
    expect(image.src).not.toContain('/logo.png');
  }
  expect(logo.querySelector('.brandLogoLight')).toBeTruthy();
  expect(logo.querySelector('.brandLogoDark')).toBeTruthy();
}

describe('approved lowercase budgetx reference wordmark', () => {
  it.each([
    { name: 'login', Page: LoginPage }, { name: 'register', Page: RegisterPage }, { name: 'forgot password', Page: ForgotPasswordPage },
  ])('uses the same accessible wordmark on $name', ({ Page }) => {
    render(createElement(Page, { onNavigate: vi.fn() }));
    expectReferenceWordmark();
    expect(document.querySelector('.authLogoImg')).toBeNull();
    expect(document.querySelector('.authLogoText')).toBeNull();
  });
  it('replaces the old topbar icon/name without changing home navigation', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const setPage = vi.fn();
    render(<Topbar page="wallet" setPage={setPage} />);
    expectReferenceWordmark();
    fireEvent.click(screen.getByRole('button', { name: 'BudgetX — beranda' }));
    expect(setPage).toHaveBeenCalledWith('dashboard');
    expect(screen.getByText('keuangan pribadi')).toBeInTheDocument();
  });
});
