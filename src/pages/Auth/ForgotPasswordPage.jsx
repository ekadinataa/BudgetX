import { useState } from 'react';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';

/**
 * ForgotPasswordPage — Email field + "Kirim Link Reset" button.
 * Always shows success message after submit (security: don't reveal if email exists).
 *
 * @param {Object} props
 * @param {(email: string) => Promise<void>} props.onResetPassword
 * @param {(page: string) => void} props.onNavigate
 */
export default function ForgotPasswordPage({ onResetPassword, onNavigate }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onResetPassword(email);
    } catch {
      // Always show success regardless of whether email exists
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="authWrapper">
      <div className="authCard">
        <div className="authLogo">
          <img src="/logo.png" alt="BudgetX" className="authLogoImg" />
          <span className="authLogoText">BudgetX</span>
        </div>
        <h1 className="authTitle">Reset Password</h1>
        <p className="authSubtitle">
          Masukkan email Anda untuk menerima link reset password
        </p>

        {sent && (
          <div className="errorBox successBox authNotice authNoticeSuccess">
            Jika email terdaftar, link reset password telah dikirim. Periksa inbox Anda.
          </div>
        )}

        {!sent && (
          <form className="authForm" onSubmit={handleSubmit}>
            <Field label="Email">
              <Input
                type="email"
                placeholder="email@contoh.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </Field>
            <button
              type="submit"
              className="btnPrimary authSubmit"
              disabled={loading}
            >
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
        )}

        <div className="authLinks">
          <button className="authLink" onClick={() => onNavigate('login')}>
            Kembali ke halaman masuk
          </button>
        </div>
      </div>
    </div>
  );
}
