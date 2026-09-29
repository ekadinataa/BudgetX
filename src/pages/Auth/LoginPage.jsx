import { useState } from 'react';
import Field from '../../components/ui/Field';
import Input from '../../components/ui/Input';
import styles from './Auth.module.css';

/**
 * LoginPage — Email + password login form.
 *
 * @param {Object} props
 * @param {(email: string, password: string) => Promise<void>} props.onLogin
 * @param {(page: string) => void} props.onNavigate - navigate to 'register' or 'forgot'
 */
export default function LoginPage({ onLogin, onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(email, password);
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
        <h1 className={styles.title}>Masuk</h1>
        <p className={styles.subtitle}>Masuk ke akun BudgetX Anda</p>

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
          <Field label="Password">
            <Input
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={loading}
          >
            {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>

        <div className={styles.links}>
          <button className={styles.link} onClick={() => onNavigate('forgot')}>
            Lupa password?
          </button>
          <span style={{ margin: '0 8px' }}>·</span>
          <button className={styles.link} onClick={() => onNavigate('register')}>
            Buat akun baru
          </button>
        </div>
      </div>
    </div>
  );
}

function mapFirebaseError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau password salah.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi nanti.';
    case 'auth/invalid-email':
      return 'Format email tidak valid.';
    default:
      return code || 'Terjadi kesalahan. Coba lagi.';
  }
}
