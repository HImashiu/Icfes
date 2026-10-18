// Kept in this browser only (IndexedDB): the teacher's recent documents and the questions in progress, so closing
// the tab or coming back tomorrow does not lose the PDF or unsaved work. Nothing here is uploaded.
const DB = "condor-builder";
const MAX_DOCS = 6;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("docs", { keyPath: "id" });
      req.result.createObjectStore("session", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
    });
  } catch {
    return null;
  }
}

// Files are stored as they are (a PDF, or the photos of one document) under the owner's id.
export async function rememberDoc(owner, files, name) {
  const id = `${owner}:${name}:${[...files].reduce((s, f) => s + f.size, 0)}`;
  const entry = { id, owner, name, files: [...files], at: Date.now() };
  await tx("docs", "readwrite", (s) => s.put(entry));
  const all = (await recentDocs(owner)) ?? [];
  for (const old of all.slice(MAX_DOCS)) await tx("docs", "readwrite", (s) => s.delete(old.id));
  return id;
}

export async function recentDocs(owner) {
  const all = (await tx("docs", "readonly", (s) => s.getAll())) ?? [];
  return all.filter((d) => d.owner === owner).sort((a, b) => b.at - a.at);
}

export async function touchDoc(entry) {
  await tx("docs", "readwrite", (s) => s.put({ ...entry, at: Date.now() }));
}

export async function forgetDoc(id) {
  await tx("docs", "readwrite", (s) => s.delete(id));
}

export async function saveSession(owner, data) {
  await tx("session", "readwrite", (s) => s.put({ id: owner, data, at: Date.now() }));
}

export async function loadSession(owner) {
  const row = await tx("session", "readonly", (s) => s.get(owner));
  return row?.data ?? null;
}

export async function clearSession(owner) {
  await tx("session", "readwrite", (s) => s.delete(owner));
}
