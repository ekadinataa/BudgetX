import { useState } from 'react';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import styles from './Auth.module.css';

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
    <div className={styles.authWrapper}>
      <div className={styles.authCard}>
        <div className={styles.logo}>
          <img src="/logo.png" alt="BudgetX" className={styles.logoImg} />
          <span className={styles.logoText}>BudgetX</span>
        </div>
        <h1 className={styles.title}>Reset Password</h1>
        <p className={styles.subtitle}>
          Masukkan email Anda untuk menerima link reset password
        </p>

        {sent && (
          <div className={styles.successBox}>
            Jika email terdaftar, link reset password telah dikirim. Periksa inbox Anda.
          </div>
        )}

        {!sent && (
          <form className={styles.form} onSubmit={handleSubmit}>
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
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Mengirim...' : 'Kirim Link Reset'}
            </button>
          </form>
        )}

        <div className={styles.links}>
          <button className={styles.link} onClick={() => onNavigate('login')}>
            Kembali ke halaman masuk
          </button>
        </div>
      </div>
    </div>
  );
}
