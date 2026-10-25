import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
export type Row = Record<string, any>;
export function ToolForm({
  title,
  path,
  fields,
  onSaved,
}: {
  title: string;
  path: string;
  fields: Array<{
    name: string;
    label: string;
    type?: string;
    value?: string | number;
    options?: Array<{ value: string | number; label: string }>;
    optional?: boolean;
  }>;
  onSaved?: (data: Row) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data: Row = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const field of fields) {
        if (field.type === 'checkbox') data[field.name] = data[field.name] === 'on';
        if (field.type === 'json') data[field.name] = JSON.parse(data[field.name] || 'null');
      }
      const result = await api.post<Row>(path, data);
      onSaved?.(result);
      setNotice(result.note ?? 'Saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ops-card">
      <h3>{title}</h3>
      <form onSubmit={submit}>
        <fieldset className="ops-form-grid" disabled={busy}>
          {fields.map((field) => (
            <label
              className={['json', 'textarea'].includes(field.type ?? '') ? 'wide' : ''}
              key={field.name}
            >
              {field.label}
              {field.options ? (
                <select
                  name={field.name}
                  required={!field.optional}
                  defaultValue={field.value ?? ''}
                  aria-label={field.label}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : ['json', 'textarea'].includes(field.type ?? '') ? (
                <textarea name={field.name} required={!field.optional} defaultValue={field.value} />
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? 'text'}
                  step={field.type === 'number' ? 'any' : undefined}
                  required={field.type === 'checkbox' ? false : !field.optional}
                  defaultValue={field.type === 'checkbox' ? undefined : field.value}
                />
              )}
            </label>
          ))}
          <button className="command-action blue">{busy ? 'Working…' : 'Save / run'}</button>
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
export function downloadText(name: string, value: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
