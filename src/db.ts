import type { ReviewDoc, SessionDoc, Settings, Task } from "./types";

const DB_NAME = "reading-gym";
const DB_VERSION = 1;

export const STORES = ["tasks", "sessions", "reviews", "settings"] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tasks")) {
        db.createObjectStore("tasks", { keyPath: "task_id" });
      }
      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains("reviews")) {
        db.createObjectStore("reviews", { keyPath: "task_id" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  name: (typeof STORES)[number],
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(name, mode);
  const store = tx.objectStore(name);
  const result = await run(store);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

export const db = {
  getTask(taskId: string) {
    return withStore("tasks", "readonly", (s) => toPromise<Task | undefined>(s.get(taskId)));
  },
  listTasks() {
    return withStore("tasks", "readonly", (s) => toPromise<Task[]>(s.getAll()));
  },
  putTask(task: Task) {
    return withStore("tasks", "readwrite", (s) => toPromise(s.put(task)));
  },

  getSession(date: string) {
    return withStore("sessions", "readonly", (s) => toPromise<SessionDoc | undefined>(s.get(date)));
  },
  putSession(session: SessionDoc) {
    return withStore("sessions", "readwrite", (s) => toPromise(s.put(session)));
  },
  listSessions() {
    return withStore("sessions", "readonly", (s) => toPromise<SessionDoc[]>(s.getAll()));
  },

  getReview(taskId: string) {
    return withStore("reviews", "readonly", (s) => toPromise<ReviewDoc | undefined>(s.get(taskId)));
  },
  putReview(review: ReviewDoc) {
    return withStore("reviews", "readwrite", (s) => toPromise(s.put(review)));
  },

  getSettings() {
    return withStore("settings", "readonly", (s) =>
      toPromise<(Settings & { id: string }) | undefined>(s.get("app")),
    );
  },
  putSettings(settings: Settings) {
    return withStore("settings", "readwrite", (s) =>
      toPromise(s.put({ id: "app", ...settings })),
    );
  },
};

export type Backup = {
  kind: "reading-gym-backup";
  schema_version: string;
  exported_at: string;
  tasks: Task[];
  sessions: SessionDoc[];
  reviews: ReviewDoc[];
  settings: Settings | null;
};

export async function exportBackup(): Promise<Backup> {
  const [tasks, sessions, reviews, settings] = await Promise.all([
    db.listTasks(),
    db.listSessions(),
    withStore("reviews", "readonly", (s) => toPromise<ReviewDoc[]>(s.getAll())),
    db.getSettings(),
  ]);
  const { id: _ignored, ...rest } = settings ?? ({} as Settings & { id?: string });
  return {
    kind: "reading-gym-backup",
    schema_version: "0.2",
    exported_at: new Date().toISOString(),
    tasks,
    sessions,
    reviews,
    settings: settings ? (rest as Settings) : null,
  };
}

export async function importBackup(backup: Backup) {
  for (const task of backup.tasks) await db.putTask(task);
  for (const session of backup.sessions) await db.putSession(session);
  for (const review of backup.reviews) await db.putReview(review);
  if (backup.settings) await db.putSettings(backup.settings);
}

export async function clearAll() {
  for (const store of STORES) {
    await withStore(store, "readwrite", (s) => toPromise(s.clear()));
  }
}
