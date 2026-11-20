import {
  users, departments, categories, requests, approvalHistory, suppliers,
  purchaseOrders, goodsReceiptNotes, softwareLicenses, payments,
  notifications, rfqs, quotations, auditLogs, approvalRules, roles,
  chartData, tenders, tenderBids,
} from './mockData';
import { API_BASE_URL } from '../services/apiConfig';

const STORAGE_KEY = 'eps_mock_snapshot';
const collections = {
  users, departments, categories, requests, approvalHistory, suppliers,
  purchaseOrders, goodsReceiptNotes, softwareLicenses, payments,
  notifications, rfqs, quotations, auditLogs, approvalRules, roles,
  chartData, tenders, tenderBids,
};

let revision = 0;
let applyingRemote = false;
let syncStarted = false;
let writeQueue = Promise.resolve();
let localDirty = false;
let lastServerData = null;
let remoteChangeHandler = () => {};

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const snapshot = () => Object.fromEntries(Object.entries(collections));

export const normalizeSharedSnapshot = (data) => {
  if (!data || !Array.isArray(data.approvalRules)) return data;
  return {
    ...data,
    approvalRules: data.approvalRules.map((rule) => ({
      ...rule,
      maxAmount: rule.maxAmount == null ? Infinity : rule.maxAmount,
    })),
  };
};

const mergeRecord = (base, local, remote) => {
  const merged = { ...(remote || {}) };
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  for (const key of keys) {
    if (equal(local?.[key], base?.[key])) continue;
    if (local && Object.prototype.hasOwnProperty.call(local, key)) merged[key] = clone(local[key]);
    else delete merged[key];
  }
  return merged;
};

const mergeRecords = (base = [], local = [], remote = []) => {
  if (![base, local, remote].every(Array.isArray)) return clone(local);
  const baseById = new Map(base.filter((item) => item?.id != null).map((item) => [String(item.id), item]));
  const localById = new Map(local.filter((item) => item?.id != null).map((item) => [String(item.id), item]));
  const remoteById = new Map(remote.filter((item) => item?.id != null).map((item) => [String(item.id), item]));
  if ([...base, ...local, ...remote].some((item) => item?.id == null)) return clone(local);

  const merged = new Map(remote.map((item) => [String(item.id), clone(item)]));
  for (const [id, localItem] of localById) {
    const baseItem = baseById.get(id);
    const remoteItem = remoteById.get(id);
    if (!baseItem) {
      if (!remoteItem) merged.set(id, clone(localItem));
      else if (!equal(localItem, remoteItem)) {
        // Distinct concurrent additions must not erase each other on id collision.
        const uniqueId = `${id}-${globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
        merged.set(uniqueId, { ...clone(localItem), id: uniqueId });
      }
      continue;
    }
    if (!remoteItem) {
      merged.set(id, clone(localItem));
      continue;
    }
    if (!equal(localItem, baseItem)) merged.set(id, mergeRecord(baseItem, localItem, remoteItem));
  }

  for (const [id, baseItem] of baseById) {
    if (localById.has(id)) continue;
    const remoteItem = remoteById.get(id);
    if (remoteItem && equal(remoteItem, baseItem)) merged.delete(id);
  }
  return [...merged.values()];
};

/** Three-way merge local edits with another browser's latest committed snapshot. */
export const mergeSharedSnapshots = (base = {}, local = {}, remote = {}) => {
  const result = { ...clone(remote) };
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  for (const key of keys) {
    const baseValue = base?.[key];
    const localValue = local?.[key];
    const remoteValue = remote?.[key];
    if (equal(localValue, baseValue)) continue;
    if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      result[key] = mergeRecords(baseValue || [], localValue, remoteValue);
    } else if (localValue && remoteValue && typeof localValue === 'object' && typeof remoteValue === 'object') {
      result[key] = mergeRecord(baseValue || {}, localValue, remoteValue);
    } else {
      result[key] = clone(localValue);
    }
  }
  return result;
};

const applyData = (data) => {
  if (!data || typeof data !== 'object') return;
  data = normalizeSharedSnapshot(data);
  for (const [key, target] of Object.entries(collections)) {
    const incoming = data[key];
    if (Array.isArray(target) && Array.isArray(incoming)) {
      target.splice(0, target.length, ...incoming);
    } else if (key === 'chartData' && incoming && typeof incoming === 'object') {
      for (const oldKey of Object.keys(target)) delete target[oldKey];
      Object.assign(target, incoming);
    }
  }
};

const saveLocal = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
  } catch (error) {
    console.warn('Could not save the demo data in this browser.', error);
  }
};

const announceRemoteChange = () => {
  applyingRemote = true;
  try {
    remoteChangeHandler();
  } finally {
    applyingRemote = false;
  }
};

const saveRemote = async () => {
  if (!API_BASE_URL || applyingRemote) return;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const submitted = snapshot();
    try {
      const response = await fetch(`${API_BASE_URL}/demo-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, data: submitted }),
      });
      const result = await response.json();
      if (response.status === 409) {
        const local = snapshot();
        const merged = mergeSharedSnapshots(lastServerData || {}, local, result.data || {});
        revision = Number(result.revision) || 0;
        lastServerData = clone(result.data || {});
        applyingRemote = true;
        applyData(merged);
        saveLocal();
        applyingRemote = false;
        localDirty = true;
        announceRemoteChange();
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      revision = result.revision;
      lastServerData = clone(result.data || submitted);
      localDirty = false;
      return;
    } catch (error) {
      applyingRemote = false;
      console.warn('Shared demo data could not reach the backend; browser storage is still active.', error);
      return;
    }
  }
  console.warn('Shared demo data changed in several browsers at once; sync will retry on the next update.');
};

const loadRemote = async () => {
  if (!API_BASE_URL) return;
  try {
    const response = await fetch(`${API_BASE_URL}/demo-state`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    revision = Number(state.revision) || 0;
    const remote = state.data && typeof state.data === 'object' ? state.data : null;
    if (!remote) {
      lastServerData = null;
      if (Object.values(snapshot()).some((value) => Array.isArray(value) && value.length)) await saveRemote();
      return;
    }

    if (localDirty) {
      const merged = mergeSharedSnapshots(lastServerData || {}, snapshot(), remote);
      lastServerData = clone(remote);
      applyingRemote = true;
      applyData(merged);
      saveLocal();
      applyingRemote = false;
      localDirty = true;
      announceRemoteChange();
      writeQueue = writeQueue.catch(() => {}).then(saveRemote);
      return;
    }

    if (!lastServerData || !equal(lastServerData, remote)) {
      lastServerData = clone(remote);
      applyingRemote = true;
      applyData(remote);
      saveLocal();
      applyingRemote = false;
      announceRemoteChange();
    }
  } catch (error) {
    applyingRemote = false;
    console.warn('Shared demo backend is unavailable; using this browser’s saved demo data.', error);
  }
};

/** Applies a successful server-side workflow update to this browser. */
export const applyServerSnapshot = (state) => {
  if (!state || !Number.isFinite(Number(state.revision)) || !state.data || typeof state.data !== 'object') {
    throw new TypeError('The server returned an invalid shared-state snapshot.');
  }
  revision = Number(state.revision);
  lastServerData = clone(state.data);
  localDirty = false;
  applyingRemote = true;
  try {
    applyData(state.data);
    saveLocal();
    remoteChangeHandler();
  } finally {
    applyingRemote = false;
  }
};

/** Restore local data, then use Spring Boot as the shared source for all browsers. */
export async function initializeSharedData(onRemoteChange) {
  remoteChangeHandler = typeof onRemoteChange === 'function' ? onRemoteChange : () => {};
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) applyData(JSON.parse(saved));
  } catch {
    // Keep the seeded data when browser storage is missing or invalid.
  }

  saveLocal();
  await loadRemote();
  if (!API_BASE_URL || syncStarted) return;

  syncStarted = true;
  window.setInterval(loadRemote, 2000);
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      applyData(JSON.parse(event.newValue));
      remoteChangeHandler();
    } catch {
      // Ignore incomplete writes from another tab.
    }
  });
}

/** Persist every workflow change locally and, when configured, to the shared backend. */
export function persistSharedData() {
  saveLocal();
  if (!applyingRemote && API_BASE_URL) {
    localDirty = true;
    writeQueue = writeQueue.catch(() => {}).then(saveRemote);
  }
}
