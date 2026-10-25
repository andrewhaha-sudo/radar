'use client';

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, MapPinned, Search, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
          <ShieldQuestion className="h-7 w-7" />
        </span>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Error 404
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">This page does not exist</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          The address may be mistyped, or the page may have moved. Nothing was changed and no data was
          lost.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
          <Button variant="outline" onClick={() => navigate('/map')}>
            <MapPinned className="h-4 w-4" /> Campus map
          </Button>
          <Button variant="outline" onClick={() => navigate('/search')}>
            <Search className="h-4 w-4" /> Search
          </Button>
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-[11px] text-muted-foreground">
          <Compass className="h-4 w-4 shrink-0" />
          <span>
            Looking for a room or hazard? Search by room code, building name or hazard reference.
          </span>
        </div>
      </div>
    </div>
  );
}
