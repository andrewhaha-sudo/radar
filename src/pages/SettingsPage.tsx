'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  DEFAULT_THEME,
  type ColorMode,
  type ThemeId,
} from '@/lib/design-tokens';
import { errorMessage } from '@/lib/api';
import { cn } from '@/components/ui/card';

const MODES: Array<{ id: ColorMode; label: string; icon: typeof Sun; hint: string }> = [
  { id: 'light', label: 'Light', icon: Sun, hint: 'Always use the light palette' },
  { id: 'dark', label: 'Dark', icon: Moon, hint: 'Always use the dark palette' },
  { id: 'system', label: 'System', icon: Monitor, hint: 'Follow your operating system' },
];

const ACCENTS = ['#3B82F6', '#8B5CF6', '#22D3EE', '#EF4444', '#F97316', '#22C55E', '#EC4899', '#FACC15'];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  inspector: 'Facilities inspector',
  teacher: 'Teacher',
  responder: 'Campus responder',
  student: 'Student',
  parent: 'Parent or guardian',
};

const PERMISSION_LABEL: Record<string, string> = {
  '*': 'Full system access',
  'dashboard:read': 'View dashboard',
  'map:read': 'View campus map',
  'hazards:read': 'View hazards',
  'hazards:write': 'Report and update hazards',
  'hazards:verify': 'Verify hazards',
  'scan:read': 'View room scans',
  'scan:write': 'Perform room scans',
  'buildings:read': 'View buildings and rooms',
  'rollcall:read': 'View roll call',
  'rollcall:write': 'Update roll call',
  'incidents:read': 'View incidents',
  'incidents:write': 'Manage incidents',
  'search:read': 'Use global search',
  'notifications:read': 'View notifications',
  'notifications:write': 'Manage notifications',
  'sos:create': 'Raise an SOS',
  'admin:users': 'Manage users and audit log',
};

export function SettingsPage() {
  const { user, school, updateProfile } = useAuth();
  const {
    themeId,
    setTheme,
    availableThemes,
    colorMode,
    setColorMode,
    accent,
    setAccent,
    resolvedMode,
  } = useTheme();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user]);

  const dirty = useMemo(
    () => name.trim() !== (user?.name ?? '') || phone.trim() !== (user?.phone ?? ''),
    [name, phone, user],
  );

  const saveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setProfileError(null);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 4000);
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const resetAppearance = () => {
    setTheme(DEFAULT_THEME);
    setColorMode(DEFAULT_MODE);
    setAccent(DEFAULT_ACCENT);
  };

  const permissions = user?.permissions ?? [];

  return (
    <div className="stack-page space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Monitor className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Appearance is stored on this device. Profile changes are saved to your account on the
            campus server.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAppearance}>
          <RotateCcw className="h-4 w-4" /> Reset appearance
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Profile */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Profile</h2>
              <p className="text-[11px] text-muted-foreground">
                Your name and phone number are visible to staff who assign work.
              </p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Full name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
              <Input
                label="Email"
                value={user?.email ?? ''}
                readOnly
                disabled
                helper="Email addresses are managed by an administrator."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Phone"
                value={phone}
                maxLength={40}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Optional contact number"
                autoComplete="tel"
                helper="Used for campus coordination only."
              />
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Role</p>
                <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3">
                  <Badge variant="outline" className="capitalize">
                    {user?.role ?? '—'}
                  </Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {ROLE_LABEL[user?.role ?? ''] ?? 'No role assigned'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Roles are changed by an administrator and enforced on the server.
                </p>
              </div>
            </div>

            {profileError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {profileError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button
                size="sm"
                onClick={() => void saveProfile()}
                loading={saving}
                disabled={!dirty || !name.trim()}
              >
                <Save className="h-4 w-4" /> Save profile
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setName(user?.name ?? '');
                    setPhone(user?.phone ?? '');
                    setProfileError(null);
                  }}
                >
                  Discard
                </Button>
              )}
              {saved && (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Profile saved
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Account */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Account</h2>
            <dl className="mt-2 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">School</dt>
                <dd className="text-right font-medium">{school?.name ?? '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">Title</dt>
                <dd className="text-right font-medium">{user?.title ?? 'Not recorded'}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">Account ID</dt>
                <dd className="text-right font-mono">{user?.id ?? '—'}</dd>
              </div>
              <div className="flex items-start justify-between gap-2">
                <dt className="text-muted-foreground">Session</dt>
                <dd className="inline-flex items-center gap-1 text-right font-medium text-success">
                  <ShieldCheck className="h-3.5 w-3.5" /> Active
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Permissions</h2>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Granted by your role and enforced server-side on every request.
            </p>
            <ul className="mt-2 space-y-1">
              {permissions.length === 0 ? (
                <li className="text-xs text-muted-foreground">No permissions granted.</li>
              ) : (
                permissions.map((permission) => (
                  <li key={permission} className="flex items-center gap-1.5 text-[11px]">
                    <Check className="h-3 w-3 shrink-0 text-success" />
                    <span>{PERMISSION_LABEL[permission] ?? permission}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Session security</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Your session is held in an HttpOnly cookie and validated against the server database.
              Signing out revokes it immediately.
            </p>
          </div>
        </aside>
      </div>

      {/* Appearance */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="text-[11px] text-muted-foreground">
                Themes apply light and dark palettes automatically. Severity colours never change.
              </p>
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Rendering the <span className="font-medium text-foreground">{resolvedMode}</span> palette
          </span>
        </div>

        <div className="space-y-5 p-4">
          {/* Colour mode */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Colour mode
            </h3>
            <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Colour mode">
              {MODES.map((mode) => {
                const Icon = mode.icon;
                const active = colorMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setColorMode(mode.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors',
                      active
                        ? 'border-accent-foreground bg-accent text-accent-foreground'
                        : 'border-border hover:bg-muted/60',
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{mode.label}</span>
                      <span
                        className={cn(
                          'block text-[10px]',
                          active ? 'opacity-80' : 'text-muted-foreground',
                        )}
                      >
                        {mode.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme cards */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Theme
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {availableThemes.map((theme) => {
                const palette = theme.palettes[resolvedMode];
                const active = themeId === theme.id;
                const swatches = [
                  palette.bg,
                  palette.card,
                  palette.border,
                  palette.primary,
                  palette.textMuted,
                ];
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setTheme(theme.id as ThemeId)}
                    aria-pressed={active}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border p-3 text-left transition-all',
                      active
                        ? 'border-accent-foreground ring-2 ring-ring/40'
                        : 'border-border hover:border-accent-border',
                    )}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-1.5"
                      style={{ background: palette.primary }}
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{theme.label}</span>
                      {active && <Check className="h-3.5 w-3.5 text-accent-foreground" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                      {theme.description}
                    </p>
                    <div className="mt-2 flex gap-1">
                      {swatches.map((color, index) => (
                        <span
                          key={`${theme.id}-${index}`}
                          className="h-3.5 w-3.5 rounded-full border border-black/10"
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Accent colour
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((color) => {
                const active = accent.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAccent(color)}
                    aria-label={`Use accent ${color}`}
                    aria-pressed={active}
                    className={cn(
                      'h-8 w-8 rounded-full border-2 border-card transition-transform hover:scale-110',
                      active ? 'ring-2 ring-ring ring-offset-2 ring-offset-card' : '',
                    )}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
              <label className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#3B82F6'}
                  onChange={(event) => setAccent(event.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  aria-label="Custom accent colour"
                />
                Custom
              </label>
              <Input
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                aria-label="Accent hex value"
                className="h-8 max-w-[140px] font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hazard severity is always paired with a symbol and a text label, so colour is never the
              only signal.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
