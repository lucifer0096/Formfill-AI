/**
 * Holds the original uploaded PDF bytes for the duration of the session, so
 * the AcroForm path can write real answers back into the real fields at
 * Confirm time. sessionStorage can't hold binary data efficiently (string
 * only, ~33% base64 overhead, and a much smaller quota than IndexedDB), so
 * this uses IndexedDB instead — still local-only, still cleared per session,
 * matching PRIVACY.md's "nothing survives past this session" bar.
 *
 * Only used for AcroForm uploads. Flat/text-layer forms have no real fields
 * to write into, so there is nothing for this store to hold for them.
 */
const DB_NAME = "formfill-original-file";
const STORE_NAME = "file";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOriginalFile(file: File): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadOriginalFile(): Promise<File | null> {
  const db = await openDb();
  const file = await new Promise<File | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(KEY);
    request.onsuccess = () => resolve((request.result as File | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}

export async function clearOriginalFile(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
