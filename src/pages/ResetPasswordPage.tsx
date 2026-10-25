import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '@/lib/api';
export function ResetPasswordPage() {
  const [token] = useState(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const access = p.get('access_token') ?? '';
    history.replaceState(null, '', window.location.pathname);
    return access;
  });
  const [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<{ message: string }>('/api/auth/password-update', {
        accessToken: token,
        password,
      });
      setMessage(result.message);
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stack-page" style={{ maxWidth: 500, paddingTop: 70 }}>
      <section className="ops-card">
        <h1>Reset your RADAR password</h1>
        {!token ? (
          <p>
            This page needs a fresh recovery link from your email. Request another link from the
            sign-in page.
          </p>
        ) : message ? (
          <p role="status">{message}</p>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button disabled={busy} className="command-action blue">
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <Link to="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
