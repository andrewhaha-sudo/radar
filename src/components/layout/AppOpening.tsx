import { useCallback, useState, type ReactNode } from 'react';
import { BrandLaunch } from './BrandLaunch';

/** Document lifetime only: a reload/new app window replays, SPA navigation does not. */
export function AppOpening({ children }: { children: ReactNode }) {
  const [opening, setOpening] = useState(true);
  const finish = useCallback(() => setOpening(false), []);
  return opening ? <BrandLaunch onComplete={finish} /> : children;
}
