import {TrainingNotice} from '@/components/advanced/TrainingNotice';
import { lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { OfflineProvider } from '@/context/OfflineContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccessDenied } from '@/components/ui/access-denied';

// Heavy routes (Leaflet, Recharts, admin tooling) are split into their own
// chunks so the login screen stays fast on a slow school network.
const OperationsPage = lazy(() => import('@/pages/OperationsPage').then(m=>({default:m.OperationsPage})));
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const MapPage = lazy(() => import('@/pages/MapPage').then((m) => ({ default: m.MapPage })));
const ScanPage = lazy(() => import('@/pages/ScanPage').then((m) => ({ default: m.ScanPage })));
const HazardsPage = lazy(() => import('@/pages/HazardsPage').then((m) => ({ default: m.HazardsPage })));
const RollCallPage = lazy(() =>
  import('@/pages/RollCallPage').then((m) => ({ default: m.RollCallPage })),
);
const IncidentsPage = lazy(() =>
  import('@/pages/IncidentsPage').then((m) => ({ default: m.IncidentsPage })),
);
const AdminPanelPage = lazy(() =>
  import('@/pages/AdminPanelPage').then((m) => ({ default: m.AdminPanelPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const SOSPage = lazy(() => import('@/pages/SOSPage').then((m) => ({ default: m.SOSPage })));
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const BuildingsPage = lazy(() =>
  import('@/pages/BuildingsPage').then((m) => ({ default: m.BuildingsPage })),
);
const AlertsPage = lazy(() => import('@/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const DisasterPage = lazy(() =>
  import('@/pages/DisasterPage').then((m) => ({ default: m.DisasterPage })),
);
const SafetyStatusPage = lazy(() =>
  import('@/pages/SafetyStatusPage').then((m) => ({ default: m.SafetyStatusPage })),
);
const EvacuationPage = lazy(() =>
  import('@/pages/EvacuationPage').then((m) => ({ default: m.EvacuationPage })),
);
const ResourcesPage = lazy(() =>
  import('@/pages/ResourcesPage').then((m) => ({ default: m.ResourcesPage })),
);
const RecoveryPage = lazy(() =>
  import('@/pages/RecoveryPage').then((m) => ({ default: m.RecoveryPage })),
);
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const OfflinePage = lazy(() =>
  import('@/pages/OfflinePage').then((m) => ({ default: m.OfflinePage })),
);

function Guarded({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) return <AccessDenied permission={permission} />;
  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-background">
      <div className="radar-ambient" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-4">
        <span className="radar-mark radar-mark--lg" aria-hidden="true">
          <span className="radar-mark__sweep" />
          <span className="radar-mark__ring radar-mark__ring--1" />
          <span className="radar-mark__ring radar-mark__ring--2" />
          <span className="radar-mark__core">R</span>
        </span>
        <div className="h-1 w-36 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-[radar-sweep_1.6s_linear_infinite] rounded-full bg-primary" />
        </div>
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Loading RADAR…
        </p>
      </div>
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <AppLayout />;
}

function ScopedOfflineProvider({children}: {children: React.ReactNode}) {
  const { user, activeWorkspaceId } = useAuth();
  return <OfflineProvider key={`${user?.accountScope ?? user?.id ?? 'guest'}:${activeWorkspaceId ?? 'default'}`}>{children}</OfflineProvider>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TrainingNotice/>
        <ScopedOfflineProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route element={<ProtectedLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="operations" element={<OperationsPage />} />
                <Route path="map" element={<MapPage />} />
                <Route
                  path="scan"
                  element={
                    <Guarded permission="scan:read">
                      <ScanPage />
                    </Guarded>
                  }
                />
                <Route
                  path="hazards"
                  element={
                    <Guarded permission="hazards:read">
                      <HazardsPage />
                    </Guarded>
                  }
                />
                <Route
                  path="rollcall"
                  element={
                    <Guarded permission="rollcall:read">
                      <RollCallPage />
                    </Guarded>
                  }
                />
                <Route
                  path="incidents"
                  element={
                    <Guarded permission="incidents:read">
                      <IncidentsPage />
                    </Guarded>
                  }
                />
                <Route
                  path="alerts"
                  element={
                    <Guarded permission="alerts:read">
                      <AlertsPage />
                    </Guarded>
                  }
                />
                <Route
                  path="disaster"
                  element={
                    <Guarded permission="advisories:read">
                      <DisasterPage />
                    </Guarded>
                  }
                />
                <Route path="safety" element={<SafetyStatusPage />} />
                <Route
                  path="evacuation"
                  element={
                    <Guarded permission="evacuation:read">
                      <EvacuationPage />
                    </Guarded>
                  }
                />
                <Route
                  path="resources"
                  element={
                    <Guarded permission="resources:read">
                      <ResourcesPage />
                    </Guarded>
                  }
                />
                <Route
                  path="recovery"
                  element={
                    <Guarded permission="recovery:read">
                      <RecoveryPage />
                    </Guarded>
                  }
                />
                <Route
                  path="analytics"
                  element={
                    <Guarded permission="analytics:read">
                      <AnalyticsPage />
                    </Guarded>
                  }
                />
                <Route path="offline" element={<OfflinePage />} />
                <Route
                  path="admin"
                  element={
                    <Guarded permission="admin:users">
                      <AdminPanelPage />
                    </Guarded>
                  }
                />
                <Route
                  path="buildings"
                  element={
                    <Guarded permission="buildings:read">
                      <BuildingsPage />
                    </Guarded>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="search" element={<SearchPage />} />
                <Route path="sos" element={<SOSPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ScopedOfflineProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
