// Per-tab expectation prevents stale tabs from writing into a different school.
export function workspaceId(): string {
  try { return sessionStorage.getItem('radar:active-workspace') ?? ''; } catch { return ''; }
}
export function setWorkspaceScope(id: string | null, userId?: number | string) {
  try {
    sessionStorage.setItem('radar:active-workspace', id ?? '');
    if (userId != null) sessionStorage.setItem('radar:workspace-account', String(userId));
  } catch { /* Requests still fail safely when a workspace expectation is unavailable. */ }
}
export function workspaceHeaders() { return { 'X-Radar-Workspace': workspaceId() }; }
export function workspaceStorageKey(base: string) {
  try { return `${base}:${sessionStorage.getItem('radar:workspace-account') ?? 'guest'}:${workspaceId() || 'default'}`; }
  catch { return `${base}:guest:default`; }
}
export function workspaceUrl(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}workspace=${encodeURIComponent(workspaceId())}`;
}
