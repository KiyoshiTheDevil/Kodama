import type { Stem } from "@/audio/separation/types";
import { STEM_STORE_NAME, openDB } from "@/lib/persistence-idb";
import type { VocalModelVariant } from "@/stores/settings";

const MAX_ENTRIES = 3;
const STEM_CACHE_VERSION = 2;

interface StemRecord {
  blob: Blob;
  createdAt: number;
  jobKey: string;
}

function makeKey(audioHash: string, stem: Stem, variant: VocalModelVariant): string {
  return `${audioHash}|${stem}|${variant}|v${STEM_CACHE_VERSION}`;
}

function makeJobKey(audioHash: string, variant: VocalModelVariant): string {
  return `${audioHash}|${variant}|v${STEM_CACHE_VERSION}`;
}

async function getStem(audioHash: string, stem: Stem, variant: VocalModelVariant): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STEM_STORE_NAME, "readonly");
    const store = tx.objectStore(STEM_STORE_NAME);
    const req = store.get(makeKey(audioHash, stem, variant));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const record = req.result as StemRecord | undefined;
      resolve(record?.blob ?? null);
    };
    tx.oncomplete = () => db.close();
  });
}

async function hasStems(audioHash: string, variant: VocalModelVariant): Promise<boolean> {
  const vocals = await getStem(audioHash, "vocals", variant);
  if (!vocals) return false;
  const instrumental = await getStem(audioHash, "instrumental", variant);
  return instrumental !== null;
}

async function putStem(audioHash: string, stem: Stem, variant: VocalModelVariant, blob: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STEM_STORE_NAME, "readwrite");
    const store = tx.objectStore(STEM_STORE_NAME);
    const record: StemRecord = {
      blob,
      createdAt: Date.now(),
      jobKey: makeJobKey(audioHash, variant),
    };
    const req = store.put(record, makeKey(audioHash, stem, variant));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
  await evictIfOverCapacity();
}

async function evictIfOverCapacity(): Promise<void> {
  const db = await openDB();
  const records = await new Promise<Array<{ key: IDBValidKey; record: StemRecord }>>((resolve, reject) => {
    const tx = db.transaction(STEM_STORE_NAME, "readonly");
    const store = tx.objectStore(STEM_STORE_NAME);
    const out: Array<{ key: IDBValidKey; record: StemRecord }> = [];
    const cursorReq = store.openCursor();
    cursorReq.onerror = () => reject(cursorReq.error);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        out.push({ key: cursor.key, record: cursor.value as StemRecord });
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    tx.oncomplete = () => db.close();
  });

  const jobs = new Map<string, { newest: number; keys: IDBValidKey[] }>();
  for (const { key, record } of records) {
    const job = jobs.get(record.jobKey) ?? { newest: 0, keys: [] };
    job.newest = Math.max(job.newest, record.createdAt);
    job.keys.push(key);
    jobs.set(record.jobKey, job);
  }
  if (jobs.size <= MAX_ENTRIES) return;

  const sortedJobs = [...jobs.entries()].sort((a, b) => a[1].newest - b[1].newest);
  const toEvict = sortedJobs.slice(0, sortedJobs.length - MAX_ENTRIES);
  const keysToDelete = toEvict.flatMap(([, job]) => job.keys);

  const dbDelete = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = dbDelete.transaction(STEM_STORE_NAME, "readwrite");
    const store = tx.objectStore(STEM_STORE_NAME);
    for (const key of keysToDelete) store.delete(key);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      dbDelete.close();
      resolve();
    };
  });
}

export { getStem, hasStems, putStem, makeKey, makeJobKey };
