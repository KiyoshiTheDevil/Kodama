// -- Constants ----------------------------------------------------------------

const DB_NAME = "ttml-composer";
const DB_VERSION = 2;
const PROJECT_STORE_NAME = "projects";
const STEM_STORE_NAME = "separated-stems";

// -- Connection ---------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
        db.createObjectStore(PROJECT_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STEM_STORE_NAME)) {
        db.createObjectStore(STEM_STORE_NAME);
      }
    };
  });
}

// -- Generic CRUD -------------------------------------------------------------

async function getFromStore<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result as T | undefined);
    transaction.oncomplete = () => db.close();
  });
}

async function setInStore<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(value, key);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => resolve();
    transaction.oncomplete = () => db.close();
  });
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).delete(key);
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => resolve();
    transaction.oncomplete = () => db.close();
  });
}

// -- Exports ------------------------------------------------------------------

export { DB_NAME, DB_VERSION, PROJECT_STORE_NAME, STEM_STORE_NAME, openDB, getFromStore, setInStore, deleteFromStore };
