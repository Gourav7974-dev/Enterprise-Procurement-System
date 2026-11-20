import { describe, expect, it } from 'vitest';
import { mergeSharedSnapshots } from '../sharedDataSync';

describe('shared snapshot conflict merge', () => {
  it('keeps edits from both browsers and merges different field changes on one record', () => {
    const base = {
      rfqs: [{ id: 'RFQ-1', status: 'pending' }],
      purchaseOrders: [{ id: 'PO-1', status: 'sent', invoiceFileId: null }],
      notifications: [],
    };
    const local = {
      rfqs: [{ id: 'RFQ-1', status: 'quoted' }, { id: 'RFQ-2', status: 'pending' }],
      purchaseOrders: [{ id: 'PO-1', status: 'accepted', invoiceFileId: null }],
      notifications: [],
    };
    const remote = {
      rfqs: [{ id: 'RFQ-1', status: 'pending' }],
      purchaseOrders: [{ id: 'PO-1', status: 'sent', invoiceFileId: 'file-1' }],
      notifications: [{ id: 'N-1', userId: 'U010', read: false }],
    };

    expect(mergeSharedSnapshots(base, local, remote)).toEqual({
      rfqs: [{ id: 'RFQ-1', status: 'quoted' }, { id: 'RFQ-2', status: 'pending' }],
      purchaseOrders: [{ id: 'PO-1', status: 'accepted', invoiceFileId: 'file-1' }],
      notifications: [{ id: 'N-1', userId: 'U010', read: false }],
    });
  });
});
