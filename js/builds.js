import { BUILD_FORMAT, BUILD_VERSION, BUILDS_STORAGE_KEY, MAX_BUILDS } from "./config.js?v=5";

function readStore() {
  try {
    const raw = localStorage.getItem(BUILDS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(BUILDS_STORAGE_KEY, JSON.stringify(store));
}

export function listBuilds() {
  const store = readStore();
  return Object.values(store)
    .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
    .slice(0, MAX_BUILDS)
    .map(({ id, name, updated_at }) => ({ id, name, updated_at }));
}

export function getBuild(id) {
  const store = readStore();
  return store[id] || null;
}

export function saveBuild(name, build, buildId = null) {
  const store = readStore();
  const id = buildId && store[buildId] ? buildId : crypto.randomUUID();
  const row = {
    id,
    name: (name || "Брактеат").trim().slice(0, 80) || "Брактеат",
    build,
    updated_at: new Date().toISOString(),
  };
  store[id] = row;

  const ordered = Object.values(store).sort((a, b) =>
    (b.updated_at || "").localeCompare(a.updated_at || "")
  );
  if (ordered.length > MAX_BUILDS) {
    for (const old of ordered.slice(MAX_BUILDS)) {
      delete store[old.id];
    }
  }

  writeStore(store);
  return row;
}

export function deleteBuild(id) {
  const store = readStore();
  if (!store[id]) return false;
  delete store[id];
  writeStore(store);
  return true;
}

export function buildExportDoc(name, build) {
  return {
    format: BUILD_FORMAT,
    version: BUILD_VERSION,
    name: (name || "Брактеат").trim().slice(0, 80) || "Брактеат",
    saved_at: new Date().toISOString(),
    build,
  };
}

export function parseImportDoc(raw) {
  let data = raw;
  if (typeof raw === "string") data = JSON.parse(raw);
  if (data?.format === BUILD_FORMAT && data.build) return data;
  if (data?.disk && (data.eternal || data.reincarnation)) {
    return {
      format: BUILD_FORMAT,
      version: BUILD_VERSION,
      name: data.name || "Брактеат",
      build: data,
    };
  }
  throw new Error("Неверный формат файла сборки");
}
