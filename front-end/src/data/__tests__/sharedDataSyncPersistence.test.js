import { afterEach, describe, expect, it, vi } from 'vitest';

const clone = (value) => JSON.parse(JSON.stringify(value));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../services/apiConfig');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared snapshot persistence', () => {
  it('retries a revision conflict while preserving the local request and remote notification', async () => {
    vi.resetModules();
    vi.doMock('../../services/apiConfig', () => ({ API_BASE_URL: 'https://backend.test/api' }));

    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    });
    vi.stubGlobal('window', {
      setInterval: vi.fn(),
      setTimeout,
      addEventListener: vi.fn(),
    });

    const demo = await import('../mockData');
    const keys = [
      'users', 'departments', 'categories', 'requests', 'approvalHistory', 'suppliers',
      'purchaseOrders', 'goodsReceiptNotes', 'softwareLicenses', 'payments', 'notifications',
      'rfqs', 'quotations', 'auditLogs', 'approvalRules', 'roles', 'chartData', 'tenders', 'tenderBids',
    ];
    const initial = Object.fromEntries(keys.map((key) => [key, clone(demo[key])]));
    const serverAfterConcurrentWrite = clone(initial);
    serverAfterConcurrentWrite.notifications.push({
      id: 'N-REMOTE-TEST', userId: 'U006', type: 'rfq_received', read: false,
    });

    const putBodies = [];
    const fetchMock = vi.fn(async (_url, options = {}) => {
      if (!options.method) {
        return { ok: true, status: 200, json: async () => ({ revision: 10, data: initial }) };
      }
      const body = JSON.parse(options.body);
      putBodies.push(body);
      if (putBodies.length === 1) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ revision: 11, data: serverAfterConcurrentWrite }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ revision: 12, data: body.data }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const sync = await import('../sharedDataSync');
    await sync.initializeSharedData(() => {});
    demo.requests.push({ id: 'REQ-LOCAL-TEST', title: 'Concurrent test request' });
    await sync.persistSharedData();

    expect(putBodies).toHaveLength(2);
    expect(putBodies[0].revision).toBe(10);
    expect(putBodies[1].revision).toBe(11);
    expect(putBodies[1].data.requests).toContainEqual(
      expect.objectContaining({ id: 'REQ-LOCAL-TEST' }),
    );
    expect(putBodies[1].data.notifications).toContainEqual(
      expect.objectContaining({ id: 'N-REMOTE-TEST' }),
    );
  });

  it('restores a locally saved edit after refresh when the first backend write failed', async () => {
    vi.resetModules();
    vi.doMock('../../services/apiConfig', () => ({ API_BASE_URL: 'https://backend.test/api' }));

    const storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    });
    vi.stubGlobal('window', {
      setInterval: vi.fn(),
      setTimeout: vi.fn(() => 1),
      addEventListener: vi.fn(),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const demoBeforeRefresh = await import('../mockData');
    const keys = [
      'users', 'departments', 'categories', 'requests', 'approvalHistory', 'suppliers',
      'purchaseOrders', 'goodsReceiptNotes', 'softwareLicenses', 'payments', 'notifications',
      'rfqs', 'quotations', 'auditLogs', 'approvalRules', 'roles', 'chartData', 'tenders', 'tenderBids',
    ];
    const serverData = Object.fromEntries(keys.map((key) => [key, clone(demoBeforeRefresh[key])]));
    let acceptWrites = false;
    let restoredWrite = null;
    const fetchMock = vi.fn(async (_url, options = {}) => {
      if (!options.method) {
        return { ok: true, status: 200, json: async () => ({ revision: 20, data: serverData }) };
      }
      if (!acceptWrites) {
        return { ok: false, status: 503, json: async () => ({ message: 'temporary outage' }) };
      }
      restoredWrite = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ revision: 21, data: restoredWrite.data }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const firstSync = await import('../sharedDataSync');
    await firstSync.initializeSharedData(() => {});
    demoBeforeRefresh.requests.push({ id: 'REQ-SAVED-LOCALLY', title: 'Unsynced request' });
    await firstSync.persistSharedData();
    const savedEnvelope = JSON.parse(storage.get('eps_mock_snapshot'));
    expect(savedEnvelope.data.requests).toContainEqual(
      expect.objectContaining({ id: 'REQ-SAVED-LOCALLY' }),
    );
    expect(savedEnvelope.serverData.requests).not.toContainEqual(
      expect.objectContaining({ id: 'REQ-SAVED-LOCALLY' }),
    );

    // Simulate a page refresh: the module and in-memory collections are recreated,
    // while browser localStorage and the remote backend remain available.
    vi.resetModules();
    vi.doMock('../../services/apiConfig', () => ({ API_BASE_URL: 'https://backend.test/api' }));
    const demoAfterRefresh = await import('../mockData');
    const secondSync = await import('../sharedDataSync');
    acceptWrites = true;
    await secondSync.initializeSharedData(() => {});
    await secondSync.persistSharedData();

    expect(restoredWrite?.data.requests).toContainEqual(
      expect.objectContaining({ id: 'REQ-SAVED-LOCALLY' }),
    );
    expect(demoAfterRefresh.requests).toContainEqual(
      expect.objectContaining({ id: 'REQ-SAVED-LOCALLY' }),
    );
  });
});
