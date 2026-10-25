'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search,
  User,
  Menu,
  ChevronDown,
  PhoneCall,
  Settings as SettingsIcon,
  LogOut as LogOutIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SchoolSelector } from '@/components/layout/SchoolDirectory';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { useAuth } from '@/context/AuthContext';

interface TopNavProps {
  onMenuToggle: () => void;
}

export function TopNav({ onMenuToggle }: TopNavProps) {
  const { user, can, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '';

  return (
    <header
      className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md md:px-5"
      aria-label="Top navigation"
    >
      <button
        onClick={onMenuToggle}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 lg:hidden"
        aria-label="RADAR home"
      >
        <span className="radar-mark" aria-hidden="true">
          <span className="radar-mark__sweep" />
          <span className="radar-mark__ring radar-mark__ring--1" />
          <span className="radar-mark__ring radar-mark__ring--2" />
          <span className="radar-mark__core">R</span>
        </span>
      </button>

      <SchoolSelector />

      <form onSubmit={handleSearch} className="ml-auto hidden w-full max-w-md md:block" role="search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rooms, hazards, alerts, advisories…"
            aria-label="Search campus"
            className="h-10 pl-9"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/search')}
          aria-label="Search"
          className="md:hidden"
        >
          <Search className="h-[18px] w-[18px]" />
        </Button>

        {can('sos:create') && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => navigate('/sos')}
            className="hidden items-center gap-1.5 sm:flex"
          >
            <PhoneCall className="h-4 w-4" />
            SOS
          </Button>
        )}

        <NotificationsPanel />
        <ThemeSwitcher />

        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((p) => !p)}
            className="flex items-center gap-2 rounded-lg border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {user?.name?.charAt(0).toUpperCase() ?? '?'}
            </span>
            <span className="hidden text-left xl:block">
              <span className="block max-w-[140px] truncate text-sm font-medium leading-tight text-foreground">
                {user?.name}
              </span>
              <span className="block text-[11px] leading-tight text-muted-foreground">{roleLabel}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 shrink-0 xl:block" />
          </button>

          {userMenuOpen && (
            <div
              className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-2xl animate-in"
              role="menu"
            >
              <div className="border-b border-border px-3 py-2">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 inline-flex rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">
                  {roleLabel} · {user?.title ?? 'Member'}
                </p>
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                role="menuitem"
              >
                <User className="h-4 w-4" /> Profile
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent"
                role="menuitem"
              >
                <SettingsIcon className="h-4 w-4" /> Settings
              </button>
              <div className="mt-1 border-t border-border pt-1">
                <button
                  onClick={async () => {
                    setUserMenuOpen(false);
                    await logout();
                    navigate('/login', { replace: true });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10"
                  role="menuitem"
                >
                  <LogOutIcon className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
