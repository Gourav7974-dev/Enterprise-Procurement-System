import { afterEach, describe, expect, it, vi } from 'vitest';

const clone = (value) => JSON.parse(JSON.stringify(value));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../../services/apiConfig');
  vi.unstubAllGlobals();
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
});
