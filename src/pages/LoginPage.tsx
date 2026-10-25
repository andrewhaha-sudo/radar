'use client';

import { WelcomeIntro, LoginShowcase } from '@/components/layout/PreparednessCarousel';

import { BrandLaunch } from '@/components/layout/BrandLaunch';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { Mail, Lock, Eye, EyeOff, ChevronDown } from 'lucide-react';

const SEEDED_ACCOUNTS = [
  {
    role: 'Administrator',
    email: 'admin@northridge.edu',
    password: 'Admin#2026',
  },
  {
    role: 'Inspector',
    email: 'inspector@northridge.edu',
    password: 'Inspect#2026',
  },
  { role: 'Teacher', email: 'teacher@northridge.edu', password: 'Teach#2026' },
  {
    role: 'Responder',
    email: 'responder@northridge.edu',
    password: 'Respond#2026',
  },
  {
    role: 'Student',
    email: 'student@northridge.edu',
    password: 'Student#2026',
  },
  { role: 'Parent', email: 'parent@northridge.edu', password: 'Parent#2026' },
];

export function LoginPage() {
  const { user, loading: authLoading, login } = useAuth();
  const [launchSeen, setLaunchSeen] = useState(() => {
    try {
      return sessionStorage.getItem('radar:launch:v1') === '1';
    } catch {
      return false;
    }
  });
  const finishLaunch = useCallback(() => {
    try {
      sessionStorage.setItem('radar:launch:v1', '1');
    } catch {}
    setLaunchSeen(true);
  }, []);
  function replayOpening() {
    setWelcomeSeen(false);
    setLaunchSeen(false);
  }
  const [welcomeSeen, setWelcomeSeen] = useState(() => {
    try {
      return sessionStorage.getItem('radar:welcome:v1') === '1';
    } catch {
      return false;
    }
  });
  function continueToLogin() {
    try {
      sessionStorage.setItem('radar:welcome:v1', '1');
    } catch {}
    setWelcomeSeen(true);
  }
  const [signupEnabled, setSignupEnabled] = useState(false);
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [configError, setConfigError] = useState('');
  const [cloudAuth, setCloudAuth] = useState(true);
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api
      .get<{
        signupEnabled: boolean;
        provider: string;
        recoveryEnabled?: boolean;
      }>('/api/auth/config')
      .then((config) => {
        setSignupEnabled(config.signupEnabled);
        setRecoveryEnabled(config.recoveryEnabled ?? config.provider === 'supabase');
        setCloudAuth(config.provider === 'supabase');
      })
      .catch((err) => setConfigError(errorMessage(err)));
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  if (!authLoading && user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      if (signup) {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        const result = await api.post<{ message: string }>('/api/auth/signup', {
          name,
          email: email.trim(),
          password,
        });
        setNotice(result.message);
        setSignup(false);
        setPassword('');
        return;
      }
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const applyAccount = (account: (typeof SEEDED_ACCOUNTS)[number]) => {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
    setShowAccounts(false);
  };

  if (!launchSeen) return <BrandLaunch onComplete={finishLaunch} />;
  if (!welcomeSeen)
    return <WelcomeIntro onContinue={continueToLogin} onReplayLogo={replayOpening} />;
  return (
    <div className="login-experience grid min-h-svh bg-background lg:grid-cols-2">
      <LoginShowcase />
      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="radar-mark" aria-hidden="true">
              <span className="radar-mark__sweep" />
              <span className="radar-mark__ring radar-mark__ring--1" />
              <span className="radar-mark__ring radar-mark__ring--2" />
              <span className="radar-mark__core">R</span>
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[0.16em]">RADAR</p>
              <p className="text-xs text-muted-foreground">Campus safety</p>
            </div>
          </div>

          <button className="login-welcome-replay" onClick={replayOpening}>
            Replay opening animation
          </button>
          <Card hover={false} className="shadow-xl">
            <CardHeader>
              <CardTitle>{signup ? 'Create your account' : 'Sign in'}</CardTitle>
              <CardDescription>Gmail and other valid email addresses are welcome.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {notice && (
                <p
                  role="status"
                  className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm"
                >
                  {notice}
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {signup && (
                  <Input
                    label="Full name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                )}
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-muted-foreground" />
                  <Input
                    label="Email address"
                    type="email"
                    autoComplete="username"
                    placeholder="yourname@gmail.com"
                    helper="No .edu email is required."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    disabled={submitting}
                  />
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-muted-foreground" />
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                    placeholder={signup ? 'At least 8 characters' : 'Your password'}
                    minLength={signup ? 8 : undefined}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2 top-[32px] grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {signup && (
                  <Input
                    label="Confirm password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={submitting}
                  />
                )}
                {configError && (
                  <p role="alert" className="text-danger">
                    {configError}
                  </p>
                )}
                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" loading={submitting}>
                  {submitting ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
                </Button>
              </form>

              {recoveryEnabled && (
                <button
                  type="button"
                  className="w-full text-center text-xs text-primary"
                  disabled={submitting}
                  onClick={async () => {
                    setError(null);
                    if (!email.trim()) {
                      setError('Enter your email address above first.');
                      return;
                    }
                    setSubmitting(true);
                    try {
                      const result = await api.post<{ message: string }>(
                        '/api/auth/password-reset',
                        { email: email.trim() },
                      );
                      setNotice(result.message);
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  Forgot password? Send recovery email
                </button>
              )}
              {signupEnabled && (
                <button
                  type="button"
                  className="w-full text-center text-sm text-primary"
                  onClick={() => {
                    setSignup(!signup);
                    setError(null);
                    setNotice('');
                  }}
                >
                  {signup ? 'Already have an account? Sign in' : 'New to RADAR? Create an account'}
                </button>
              )}
              <p className="text-center text-xs text-muted-foreground">
                After signing in, choose your school and request access. Staff approve school roles.
              </p>

              {/* Development convenience only: seeded credentials must never be
                  printed on a production login screen. */}
              {import.meta.env.DEV && !cloudAuth && (
                <div className="rounded-lg border border-dashed border-border bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setShowAccounts((p) => !p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                    aria-expanded={showAccounts}
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">Dev</Badge>
                      Seeded accounts for this installation
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showAccounts ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {showAccounts && (
                    <div className="border-t border-border p-2">
                      <p className="px-1 pb-2 text-[11px] text-muted-foreground">
                        Development build only. These accounts exist in the local database — replace
                        them before any real deployment.
                      </p>
                      <ul className="space-y-1">
                        {SEEDED_ACCOUNTS.map((account) => (
                          <li key={account.email}>
                            <button
                              type="button"
                              onClick={() => applyAccount(account)}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                            >
                              <span className="min-w-0">
                                <span className="block font-medium text-foreground">
                                  {account.role}
                                </span>
                                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                  {account.email}
                                </span>
                              </span>
                              <span className="shrink-0 text-[11px] font-medium text-accent-foreground">
                                Use
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
