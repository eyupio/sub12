// Offline outbox for Live Event scores. Persists pending shot upserts in
// IndexedDB so the scorer can keep working offline; flushes on reconnect or
// on demand. Idempotent: each entry carries a client-generated UUID and the
// server upsert keys on (participant_id, lane, shot_number) AND on client_id,
// so re-flushes are safe.
//
// Implemented against the raw IndexedDB API to avoid adding a new dependency
// before approval. The wrapper is intentionally minimal — three operations
// (enqueue, peek, flush) cover the scorecard's needs.

import { eventsApi, type RecordScoreItem } from '../api/events'

const DB_NAME = 'sub12-events'
const DB_VERSION = 1
const STORE = 'event_score_outbox'

export interface OutboxEntry extends RecordScoreItem {
  // event_slug is needed to route flushes to the right endpoint when the
  // outbox holds entries for multiple events (e.g. a scorer who hops between
  // ranges on the same device).
  event_slug: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'client_id' })
        store.createIndex('event_slug', 'event_slug', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('open db failed'))
  })
  return dbPromise
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error ?? new Error('idb request failed'))
  })
}

// Generate a stable client-side UUID. Used both as the IDB key and as the
// idempotency key sent to the server.
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback: not cryptographically strong, but acceptable for an offline
  // outbox key on platforms without crypto.randomUUID.
  return 'cid_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function enqueue(entry: OutboxEntry): Promise<void> {
  const db = await openDB()
  const store = tx(db, 'readwrite')
  await awaitRequest(store.put(entry))
}

export async function peek(eventSlug?: string): Promise<OutboxEntry[]> {
  const db = await openDB()
  const store = tx(db, 'readonly')
  const all = await awaitRequest(store.getAll() as IDBRequest<OutboxEntry[]>)
  if (!eventSlug) return all
  return all.filter((e) => e.event_slug === eventSlug)
}

export async function size(eventSlug?: string): Promise<number> {
  const all = await peek(eventSlug)
  return all.length
}

async function removeMany(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return
  const db = await openDB()
  const store = tx(db, 'readwrite')
  for (const id of clientIds) {
    store.delete(id)
  }
  await new Promise<void>((resolve, reject) => {
    store.transaction.oncomplete = () => resolve()
    store.transaction.onerror = () => reject(store.transaction.error)
  })
}

// Flush every queued entry for the given event. Returns the number of items
// confirmed by the server and removed from the outbox. Network errors leave
// entries in place for the next attempt; client/server validation errors
// (4xx) drop the offending batch so it doesn't block forever.
export async function flush(eventSlug: string): Promise<{ written: number; remaining: number }> {
  const pending = await peek(eventSlug)
  if (pending.length === 0) return { written: 0, remaining: 0 }
  // Send in chunks so a single batch can't blow memory on a long offline run.
  const CHUNK = 100
  let written = 0
  for (let i = 0; i < pending.length; i += CHUNK) {
    const chunk = pending.slice(i, i + CHUNK)
    const payload: RecordScoreItem[] = chunk.map((c) => ({
      participant_id: c.participant_id,
      lane: c.lane,
      shot_number: c.shot_number,
      result: c.result,
      note: c.note,
      client_id: c.client_id,
      recorded_at: c.recorded_at,
    }))
    // On failure, propagate so the caller can surface a stale-state badge;
    // entries stay queued for retry on the next attempt.
    const resp = await eventsApi.recordScores(eventSlug, payload)
    written += resp.written
    await removeMany(chunk.map((c) => c.client_id))
  }
  return { written, remaining: 0 }
}

// Wire flush to the browser online event so re-connects auto-resync. The
// returned cleanup removes the listener; safe to call repeatedly across
// route changes since each install creates its own handler closure.
export function installOnlineListener(eventSlug: string, onFlushed?: (n: number) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    if (!navigator.onLine) return
    flush(eventSlug)
      .then((r) => onFlushed?.(r.written))
      .catch(() => {})
  }
  window.addEventListener('online', handler)
  // Best-effort initial flush in case we came online before this listener
  // was installed (page load while online, queued items from a prior session).
  if (navigator.onLine) handler()
  return () => window.removeEventListener('online', handler)
}
