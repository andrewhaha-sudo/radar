'use client';

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

/**
 * Shown when a signed-in user opens a route their role cannot use.
 * Hiding the navigation link is a convenience; the API still enforces every
 * permission. This screen explains the boundary instead of showing a raw 403.
 */
export function AccessDenied({ permission }: { permission?: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="stack-page">
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card/88 p-8 text-center backdrop-blur-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-warning/10 text-warning">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">This area is not available to your role</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {user ? `${user.name}, your` : 'Your'} account is signed in and working, but{' '}
          <span className="font-medium text-foreground">{user?.role.replace(/_/g, ' ') ?? 'this role'}</span>{' '}
          does not include access to this page. Permission is enforced by the server — opening the URL directly
          does not bypass it.
        </p>
        {permission && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            required: {permission}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" /> Go back
          </Button>
          <Button onClick={() => navigate('/dashboard')}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Button>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          If you need this access for your safety duties, ask a school administrator to update your role.
        </p>
      </div>
    </div>
  );
}
