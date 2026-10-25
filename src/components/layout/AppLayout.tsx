import { MobileDock } from './MobileDock';
'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { WifiOff, Send } from 'lucide-react';
import { SchoolDirectoryProvider, SchoolWorkspaceBoundary } from '@/components/layout/SchoolDirectory';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { useOffline } from '@/context/OfflineContext';

function RouteFallback() {
  return (
    <div className="stack-page">
      <div className="space-y-3">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/70" />
        <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-28 animate-pulse rounded-xl border border-border bg-card/60" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card/60" />
      </div>
    </div>
  );
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { online, pendingCount } = useOffline();

  const onCloseSidebar = useCallback(() => setSidebarOpen(false), []);
  const onToggleSidebar = useCallback(() => setSidebarOpen((p) => !p), []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <SchoolDirectoryProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="relative flex min-h-svh w-full bg-background text-foreground">
        <div className="radar-ambient" aria-hidden="true" />

        <Sidebar isOpen={sidebarOpen} onClose={onCloseSidebar} />

        <div className="relative z-10 flex min-h-svh min-w-0 flex-1 flex-col">
          <TopNav onMenuToggle={onToggleSidebar} />

          {!online && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="font-semibold">You are offline.</span>
              <span className="text-warning/90">
                Showing whatever this browser has cached. Nothing you enter is reaching the school server.
              </span>
              {pendingCount > 0 && (
                <button
                  onClick={() => navigate('/offline')}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-warning/40 px-2 py-0.5 font-semibold hover:bg-warning/15"
                >
                  <Send className="h-3 w-3" /> {pendingCount} queued
                </button>
              )}
            </div>
          )}

          <main id="main-content" className="page-enter flex-1" role="main" key={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <SchoolWorkspaceBoundary><Outlet /></SchoolWorkspaceBoundary>
            </Suspense>
          </main>
          <MobileDock/>
        </div>
      </div>
    </SchoolDirectoryProvider>
  );
}
