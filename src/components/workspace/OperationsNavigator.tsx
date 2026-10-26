import { specialistTasks } from './task-catalog';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft,
  Building2,
  Users,
  ShieldAlert,
  RadioTower,
  Package,
  Route,
  HeartHandshake,
  Settings,
  UserRoundCheck,
  ClipboardCheck,
  ScanEye,
  Compass,
} from 'lucide-react';
import { TaskLibrary, type WorkspaceTask } from './TaskLibrary';
const descriptions: Record<string, [string, string, typeof Building2]> = {
  reports: [
    'Inspections & evidence',
    'Send an observation with photos. Track its review in your reports.',
    ShieldAlert,
  ],
  rooms: [
    'Inspections & evidence',
    'Find a room, open its record, and plan the next inspection.',
    Building2,
  ],
  review: [
    'Inspections & evidence',
    'Review corroboration and recurring findings before taking action.',
    ClipboardCheck,
  ],
  rollcall: [
    'People & response',
    'Account for a class and follow up on anyone not yet checked in.',
    Users,
  ],
  response: [
    'People & response',
    'Review SOS requests and time-limited emergency locations.',
    ShieldAlert,
  ],
  assembly: [
    'People & response',
    'Register gathering points and verify actual evacuation walkways.',
    Route,
  ],
  recovery: [
    'People & response',
    'Request assistance and track private follow-up.',
    HeartHandshake,
  ],
  guardians: [
    'People & response',
    'See approved school updates for your linked student.',
    UserRoundCheck,
  ],
  resources: [
    'School management',
    'Check equipment, stock changes and maintenance records.',
    Package,
  ],
  members: ['School management', 'Approve school access and assign the right permissions.', Users],
  settings: [
    'School management',
    'Keep emergency contacts and response procedures up to date.',
    Settings,
  ],
  integrations: [
    'School management',
    'Connect official feeds and manage notification delivery.',
    RadioTower,
  ],
  readiness: [
    'School management',
    'See what is ready and what still needs configuration.',
    ClipboardCheck,
  ],
  advanced: [
    'Explore & plan',
    'Campus imagery, route sketches, reports and specialist tools.',
    Compass,
  ],
};
export function OperationsNavigator({
  tabs,
  tab,
  onSelect,
}: {
  tabs: { id: string; name: string }[];
  tab: string;
  onSelect: (id: string) => void;
}) {
  const { can } = useAuth();
  const more = specialistTasks(can).map((task) => ({ ...task, id: `advanced:${task.id}` }));
  const tasks: WorkspaceTask[] = tabs.map((t) => ({
    id: t.id,
    title: t.name,
    description: descriptions[t.id]?.[1] || 'Open this school workspace.',
    group: descriptions[t.id]?.[0] || 'School management',
    icon: descriptions[t.id]?.[2] || ScanEye,
  }));
  const current = tasks.find((t) => t.id === tab);
  if (tab === 'advanced')
    return (
      <div className="workspace-crumb">
        <button className="desk-back" onClick={() => onSelect('home')}>
          <ArrowLeft size={16} /> All tasks
        </button>
        <span>/ Explore & plan</span>
      </div>
    );
  if (tab === 'home' || !current)
    return (
      <TaskLibrary
        tasks={tasks}
        searchTasks={more}
        onSelect={onSelect}
        title="One place. The right task."
        description="Inspect a room, help your people, or look after your school. Pin the tools you use most."
      />
    );
  return (
    <div className="workspace-context">
      <button className="desk-back" onClick={() => onSelect('home')}>
        <ArrowLeft size={16} /> All tasks
      </button>
      <div>
        <span>{current.group}</span>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
      </div>
      <label className="workspace-switch">
        <span className="sr-only">Switch workspace task</span>
        <select value={tab} onChange={(e) => onSelect(e.target.value)}>
          {tasks.map((t) => (
            <option value={t.id} key={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
