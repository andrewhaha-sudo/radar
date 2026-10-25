import { motion } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { House, Map, ScanLine, Compass, MessageSquarePlus, Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
export function MobileDock() {
  const { can } = useAuth(),
    location = useLocation();
  const action = can('scan:read')
    ? { to: '/scan', title: 'Inspect', icon: ScanLine }
    : can('hazards:report') || can('hazards:write')
      ? { to: '/operations?tab=reports', title: 'Report', icon: MessageSquarePlus }
      : { to: '/notifications', title: 'Updates', icon: Bell };
  const items = [
    { to: '/dashboard', title: 'Today', icon: House },
    { to: '/map', title: 'Campus', icon: Map },
    action,
    { to: '/operations', title: 'Workspace', icon: Compass },
  ];
  const reporting =
    location.pathname === '/operations' &&
    new URLSearchParams(location.search).get('tab') === 'reports' &&
    action.title === 'Report';
  function selected(item: typeof action) {
    if (item.title === 'Report') return reporting;
    if (item.title === 'Workspace') return location.pathname === '/operations' && !reporting;
    return location.pathname === item.to;
  }
  return (
    <nav className="radar-mobile-dock" aria-label="Mobile shortcuts">
      {items.map((item) => (
        <Link aria-current={selected(item) ? 'page' : undefined} to={item.to} key={item.title}>
          {selected(item) && (
            <motion.span
              className="dock-active-indicator"
              layoutId="dock-active-indicator"
              aria-hidden="true"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <item.icon size={21} strokeWidth={1.7} />
          <span>{item.title}</span>
        </Link>
      ))}
    </nav>
  );
}
