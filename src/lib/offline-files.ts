import { workspaceStorageKey } from './workspace';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser cannot save offline photo evidence.'));
      return;
    }
    const request = indexedDB.open('radar-offline-files-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveOfflineFile(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error('Offline evidence must be JPEG, PNG or WebP up to 10 MB.');
  const db = await database();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({
        id,
        scope: workspaceStorageKey('radar:files'),
        name: file.name,
        type: file.type,
        blob: file,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return id;
  } finally {
    db.close();
  }
}
export async function readOfflineFile(id: string): Promise<File> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || row.scope !== workspaceStorageKey('radar:files')) {
          reject(new Error('Offline evidence is not available in this account and school.'));
          return;
        }
        resolve(new File([row.blob], row.name, { type: row.type }));
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
export async function deleteOfflineFile(id: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const request = store.get(id);
      request.onsuccess = () => {
        if (request.result?.scope === workspaceStorageKey('radar:files')) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
