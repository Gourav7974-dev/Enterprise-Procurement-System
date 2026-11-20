import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiCall, isMockMode } = vi.hoisted(() => ({
  apiCall: vi.fn(),
  isMockMode: vi.fn(),
}));

vi.mock('../apiConfig', () => ({
  API_BASE_URL: 'https://api.example.test/api',
  apiCall,
  isMockMode,
}));

vi.mock('../../store/epsStore', () => ({ submitQuotation: vi.fn() }));

import {
  getSupplierPurchaseOrders,
  getSupplierQuotations,
  getSupplierRfqs,
} from '../supplierPortalService';
import { getNotifications } from '../notificationService';
import { users } from '../../data/mockData';

describe('API collection response contracts', () => {
  beforeEach(() => {
    apiCall.mockReset();
    isMockMode.mockReturnValue(false);
  });

  it('normalizes paged supplier quotations to the array used by the portal', async () => {
    const quotation = { id: 'Q001', supplierId: 'S001' };
    apiCall.mockResolvedValue({ content: [quotation], totalElements: 1 });

    await expect(getSupplierQuotations('S001')).resolves.toEqual([quotation]);
    expect(apiCall).toHaveBeenCalledWith('/quotations?supplierId=S001');
  });

  it('keeps supplier rows isolated for all three seeded supplier IDs', async () => {
    apiCall.mockImplementation(async (endpoint) => {
      const supplierId = new URL(endpoint, 'https://api.example.test').searchParams.get('supplierId');
      return { content: [{ id: `Q-${supplierId}`, supplierId }], totalElements: 1 };
    });

    for (const supplierId of ['S001', 'S002', 'S003']) {
      await expect(getSupplierQuotations(supplierId)).resolves.toEqual([
        { id: `Q-${supplierId}`, supplierId },
      ]);
    }
  });

  it('maps each seeded supplier account to its own supplier record', () => {
    const suppliers = users
      .filter((user) => user.role === 'supplier')
      .map(({ email, supplierId }) => ({ email, supplierId }));

    expect(suppliers).toEqual([
      { email: 'amit@technohub.in', supplierId: 'S001' },
      { email: 'neha@softlicense.com', supplierId: 'S002' },
      { email: 'orders@furnicraft.in', supplierId: 'S003' },
    ]);
  });

  it('normalizes RFQs and purchase orders while preserving their page envelope', async () => {
    apiCall
      .mockResolvedValueOnce({ content: [{ id: 'R1' }], totalElements: 4 })
      .mockResolvedValueOnce({ content: [{ id: 'PO1' }], totalElements: 1 });

    await expect(getSupplierRfqs('S001')).resolves.toEqual({ content: [{ id: 'R1' }], totalElements: 4 });
    await expect(getSupplierPurchaseOrders('S001')).resolves.toEqual({ content: [{ id: 'PO1' }], totalElements: 1 });
  });

  it('normalizes notification pages before the header iterates them', async () => {
    const notification = { id: 'N001', read: false };
    apiCall.mockResolvedValue({ content: [notification], unreadCount: 1, totalElements: 1 });

    await expect(getNotifications('U013')).resolves.toEqual([notification]);
  });

  it('rejects malformed collection responses with a contract error', async () => {
    apiCall.mockResolvedValue({ data: [{ id: 'Q001' }] });

    await expect(getSupplierQuotations('S001')).rejects.toThrow(/Invalid supplier quotations response/);
  });
});
