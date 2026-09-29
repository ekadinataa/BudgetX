import { useState } from 'react';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import styles from './Auth.module.css';

/**
 * RegisterPage — Email + password + confirm password registration form.
 *
 * Client-side validation: password >= 8 chars, passwords match.
 *
 * @param {Object} props
 * @param {(email: string, password: string) => Promise<void>} props.onRegister
 * @param {(page: string) => void} props.onNavigate
 */
export default function RegisterPage({ onRegister, onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errors = {};
    if (password.length < 8) {
      errors.password = 'Password minimal 8 karakter.';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Password tidak cocok.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await onRegister(email, password);
    } catch (err) {
      setError(mapFirebaseError(err.code || err.message));
    } finally {
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
        <h1 className={styles.title}>Daftar</h1>
        <p className={styles.subtitle}>Buat akun BudgetX baru</p>

        {error && <div className={styles.errorBox}>{error}</div>}

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
          <Field label="Password" error={fieldErrors.password}>
            <Input
              type="password"
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <Field label="Konfirmasi Password" error={fieldErrors.confirmPassword}>
            <Input
              type="password"
              placeholder="Ulangi password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </Field>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Daftar'}
          </button>
        </form>

        <div className={styles.links}>
          Sudah punya akun?{' '}
          <button className={styles.link} onClick={() => onNavigate('login')}>
            Masuk
          </button>
        </div>
      </div>
    </div>
  );
}

function mapFirebaseError(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email sudah terdaftar.';
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    case 'auth/weak-password':
      return 'Password terlalu lemah. Gunakan minimal 8 karakter.';
    default:
      return code || 'Terjadi kesalahan. Coba lagi.';
  }
}
