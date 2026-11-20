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

const saveRemote = async () => {
  if (!API_BASE_URL || applyingRemote) return;
  try {
    const response = await fetch(`${API_BASE_URL}/demo-state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot()),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    revision = result.revision;
    localDirty = false;
  } catch (error) {
    console.warn('Shared demo data could not reach the backend; browser storage is still active.', error);
  }
};

const loadRemote = async (onRemoteChange) => {
  if (!API_BASE_URL) return;
  try {
    const response = await fetch(`${API_BASE_URL}/demo-state`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    if (state.data) {
      if (localDirty) {
        await saveRemote();
        return;
      }
      if (state.revision !== revision) {
        applyingRemote = true;
        applyData(state.data);
        revision = state.revision;
        localDirty = false;
        saveLocal();
        onRemoteChange();
        applyingRemote = false;
      }
    } else {
      await saveRemote();
    }
  } catch (error) {
    applyingRemote = false;
    console.warn('Shared demo backend is unavailable; using this browser’s saved demo data.', error);
  }
};

/** Restore local data, then use Spring Boot as the shared source for all browsers. */
export async function initializeSharedData(onRemoteChange) {
  if (typeof localStorage === 'undefined') return;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) applyData(JSON.parse(saved));
  } catch {
    // Keep the seeded data when browser storage is missing or invalid.
  }

  saveLocal();
  await loadRemote(onRemoteChange);
  if (!API_BASE_URL || syncStarted) return;

  syncStarted = true;
  window.setInterval(() => loadRemote(onRemoteChange), 2000);
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      applyData(JSON.parse(event.newValue));
      onRemoteChange();
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
