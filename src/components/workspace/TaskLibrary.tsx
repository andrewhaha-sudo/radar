import { useState, type ElementType } from 'react';
import { ArrowRight, Search, Star, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
export type WorkspaceTask = {
  id: string;
  title: string;
  description: string;
  group: string;
  icon: ElementType;
  hint?: string;
};
export function TaskLibrary({
  tasks,
  searchTasks = [],
  onSelect,
  title = 'What would you like to do?',
  description = 'Choose a task. We’ll keep the rest out of your way.',
  storageKey = 'workspace',
}: {
  tasks: WorkspaceTask[];
  searchTasks?: WorkspaceTask[];
  onSelect: (id: string) => void;
  title?: string;
  description?: string;
  storageKey?: string;
}) {
  const { user, activeWorkspaceId } = useAuth();
  const [query, setQuery] = useState('');
  const key = `radar-tools:${user?.id}:${activeWorkspaceId || 'home'}:${storageKey}`;
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>(() => {
    try {
      return { key, ids: JSON.parse(localStorage.getItem(key) || '[]') };
    } catch {
      return { key, ids: [] };
    }
  });
  const favorites = saved.key === key && Array.isArray(saved.ids) ? saved.ids : [];
  function pin(id: string) {
    const ids = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id];
    setSaved({ key, ids });
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* Preferences are optional. */
    }
  }
  const allTasks = [...tasks, ...searchTasks];
  const filtered = (query.trim() ? allTasks : tasks).filter((task) =>
    `${task.title} ${task.description} ${task.group}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const groups = [...new Set(filtered.map((t) => t.group))];
  return (
    <div className="task-library">
      <header>
        <div>
          <p className="desk-eyebrow">YOUR WORKSPACE</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <label className="task-search">
          <Search size={18} />
          <span className="sr-only">Find a task</span>
          <input
            placeholder="Find a task…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear task search" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </label>
      </header>
      {!query && favorites.length > 0 && (
        <div className="task-pinned">
          <span>
            <Star size={14} /> Pinned
          </span>
          {allTasks
            .filter((t) => favorites.includes(t.id))
            .map((t) => (
              <button key={t.id} onClick={() => onSelect(t.id)}>
                {t.title}
                <ArrowRight size={13} />
              </button>
            ))}
        </div>
      )}
      {groups.map((group, index) => (
        <section className="task-group" key={group}>
          <div className="task-group-label">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{group}</h3>
          </div>
          <div className="task-cards">
            {filtered
              .filter((t) => t.group === group)
              .map((task) => (
                <article className="task-card" key={task.id}>
                  <button className="task-card-main" onClick={() => onSelect(task.id)}>
                    <span className="task-icon">
                      <task.icon size={23} strokeWidth={1.6} />
                    </span>
                    <strong>{task.title}</strong>
                    <p>{task.description}</p>
                    <span className="task-card-bottom">
                      {task.hint || 'Open workspace'}
                      <ArrowRight size={17} />
                    </span>
                  </button>
                  <button
                    className={`task-pin ${favorites.includes(task.id) ? 'is-pinned' : ''}`}
                    aria-label={`${favorites.includes(task.id) ? 'Unpin' : 'Pin'} ${task.title}`}
                    aria-pressed={favorites.includes(task.id)}
                    onClick={() => pin(task.id)}
                  >
                    <Star size={16} fill={favorites.includes(task.id) ? 'currentColor' : 'none'} />
                  </button>
                </article>
              ))}
          </div>
        </section>
      ))}
      {!filtered.length && (
        <div className="desk-empty">
          <Search size={28} />
          <h3>No tasks match “{query}”</h3>
          <p>Try “rooms”, “people”, “routes” or clear your search.</p>
          <button className="desk-button" onClick={() => setQuery('')}>
            Show all tasks
          </button>
        </div>
      )}
    </div>
  );
}
