import { apiCall, isMockMode, API_BASE_URL } from './apiConfig';
import { readArrayResponse, readObjectResponse } from './responseData';
import {
  rfqs as mockRfqs,
  quotations as mockQuotations,
  purchaseOrders as mockPos,
  suppliers as mockSuppliers,
  payments as mockPayments,
} from '../data/mockData';
import {
  acceptSupplierPurchaseOrder,
  declineSupplierRfq,
  submitQuotation as storeSubmitQuotation,
  updateRfqAvailability as storeUpdateRfqAvailability,
  updateSupplierCompanyProfile,
  updateSupplierPurchaseOrderStatus,
  rejectSupplierPurchaseOrder,
} from '../store/epsStore';
import { applyServerSnapshot } from '../data/sharedDataSync';

/**
 * GET /suppliers/portal/dashboard/:supplierId
 */
/**
 * Purchase orders a supplier may see: only orders the procurement officer has
 * actually issued after finance approval (draft / finance stages stay internal).
 */
const INTERNAL_PO_STATUSES = ['draft', 'pending_finance', 'finance_approved', 'finance_rejected'];
const supplierVisiblePos = (supplierId) =>
  mockPos.filter((po) => po.supplierId === supplierId && !INTERNAL_PO_STATUSES.includes(po.status));

export const getSupplierPortalStats = async (supplierId) => {
  if (!isMockMode()) {
    const response = readObjectResponse(
      await apiCall(`/suppliers/portal/dashboard/${encodeURIComponent(supplierId)}`),
      'supplier dashboard statistics',
    );
    const statKeys = [
      'pendingRfqs',
      'submittedQuotations',
      'purchaseOrdersReceived',
      'activeOrders',
      'completedOrders',
    ];
    if (statKeys.some((key) => !Number.isFinite(response[key]))) {
      throw new TypeError('Invalid supplier dashboard statistics response.');
    }
    return response;
  }

  const myRfqs = mockRfqs.filter(r => r.supplierId === supplierId);
  const myQuotations = mockQuotations.filter(q => q.supplierId === supplierId);
  const myPos = supplierVisiblePos(supplierId);

  return {
    pendingRfqs: myRfqs.filter(r => r.status === 'pending').length,
    submittedQuotations: myQuotations.length,
    purchaseOrdersReceived: myPos.length,
    activeOrders: myPos.filter(po => ['accepted', 'processing', 'packed', 'shipped'].includes(po.status)).length,
    completedOrders: myPos.filter(po => ['delivered', 'closed'].includes(po.status)).length,
  };
};

/**
 * GET /rfqs?supplierId=:supplierId
 */
export const getSupplierRfqs = async (supplierId, statusFilter = '') => {
  if (!isMockMode()) {
    const params = new URLSearchParams();
    if (supplierId) params.append('supplierId', supplierId);
    if (statusFilter) params.append('status', statusFilter);
    const response = await apiCall(`/rfqs?${params.toString()}`);
    const content = readArrayResponse(response, 'supplier RFQs');
    return {
      content,
      totalElements: Number.isFinite(response?.totalElements) ? response.totalElements : content.length,
    };
  }

  let list = mockRfqs.filter(r => r.supplierId === supplierId);
  if (statusFilter) {
    list = list.filter(r => r.status === statusFilter);
  }
  return { content: list, totalElements: list.length };
};

/**
 * PATCH /rfqs/:id/availability
 */
export const updateProductAvailability = async (rfqId, productAvailability) => {
  if (!isMockMode()) {
    return apiCall(`/rfqs/${rfqId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ productAvailability }),
    });
  }

  const rfq = mockRfqs.find(r => r.id === rfqId);
  if (rfq) {
    rfq.productAvailability = productAvailability;
  }
  return rfq;
};

/**
 * POST /rfqs/:id/decline
 */
export const declineRfq = async (rfqId, declineReason, declineRemarks) => {
  if (!isMockMode()) {
    return apiCall(`/rfqs/${rfqId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ declineReason, declineRemarks }),
    });
  }

  const rfq = mockRfqs.find(r => r.id === rfqId);
  if (rfq) {
    rfq.status = 'declined';
    rfq.productAvailability = 'Out of Stock';
    rfq.declineReason = declineReason;
    rfq.declineRemarks = declineRemarks;
  }
  return rfq;
};

/**
 * POST /quotations
 */
export const submitQuotation = async (quotationData) => {
  if (!isMockMode()) {
    return apiCall('/quotations', {
      method: 'POST',
      body: JSON.stringify(quotationData),
    });
  }

  // The store applies the workflow: quotation goes to finance for approval,
  // finance + procurement are notified, and the RFQ is marked as quoted.
  return storeSubmitQuotation(quotationData);
};

/**
 * GET /quotations?supplierId=:supplierId
 */
export const getSupplierQuotations = async (supplierId, statusFilter = '') => {
  if (!isMockMode()) {
    const params = new URLSearchParams({ supplierId });
    if (statusFilter) params.set('status', statusFilter);
    const response = await apiCall(`/quotations?${params.toString()}`);
    return readArrayResponse(response, 'supplier quotations');
  }

  let list = mockQuotations.filter(q => q.supplierId === supplierId);
  if (statusFilter) {
    list = list.filter(q => q.status === statusFilter);
  }
  return list;
};

/**
 * GET /purchase-orders?supplierId=:supplierId
 */
export const getSupplierPurchaseOrders = async (supplierId, statusFilter = '') => {
  if (!isMockMode()) {
    const params = new URLSearchParams({ supplierId });
    if (statusFilter) params.set('status', statusFilter);
    const response = await apiCall(`/purchase-orders?${params.toString()}`);
    const content = readArrayResponse(response, 'supplier purchase orders');
    return {
      content,
      totalElements: Number.isFinite(response?.totalElements) ? response.totalElements : content.length,
    };
  }

  let list = supplierVisiblePos(supplierId);
  if (statusFilter) {
    list = list.filter(po => po.status === statusFilter);
  }
  return { content: list, totalElements: list.length };
};

/**
 * POST /purchase-orders/:id/accept
 */
export const acceptPurchaseOrder = async (poId) => {
  if (!isMockMode()) {
    return apiCall(`/purchase-orders/${poId}/accept`, { method: 'POST' });
  }

  const po = mockPos.find(p => p.id === poId);
  if (po) {
    po.status = 'accepted';
  }
  return po;
};

/**
 * POST /purchase-orders/:id/reject
 */
export const rejectPurchaseOrder = async (poId, reason) => {
  if (!isMockMode()) {
    return apiCall(`/purchase-orders/${poId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  const po = mockPos.find(p => p.id === poId);
  if (po) {
    po.status = 'rejected';
    po.reclineReason = reason;
  }
  return po;
};

/**
 * PATCH /purchase-orders/:id/status
 */
export const updateOrderStatus = async (poId, status) => {
  if (!isMockMode()) {
    return apiCall(`/purchase-orders/${poId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  const po = mockPos.find(p => p.id === poId);
  if (po) {
    po.status = status;
  }
  return { message: 'Status updated', newStatus: status };
};

/**
 * POST /purchase-orders/:id/invoice
 */
export const uploadInvoice = async (poId, invoiceData) => {
  if (!isMockMode()) {
    return apiCall(`/purchase-orders/${poId}/invoice`, {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
  }

  const po = mockPos.find(p => p.id === poId);
  if (po) {
    po.invoiceNumber = invoiceData.invoiceNumber;
    po.invoiceAmount = invoiceData.invoiceAmount || po.totalAmount;
    po.invoiceFileName = invoiceData.invoiceFileName || `INV_${poId}.pdf`;
    po.invoiceUploadedAt = new Date().toISOString().split('T')[0];
  }
  return po;
};

/**
 * GET /suppliers/portal/profile/:supplierId
 */
export const getSupplierProfile = async (supplierId) => {
  if (!isMockMode()) {
    const response = await apiCall(`/suppliers/portal/profile/${encodeURIComponent(supplierId)}`);
    return response == null ? null : readObjectResponse(response, 'supplier profile');
  }

  return mockSuppliers.find(s => s.id === supplierId);
};

/**
 * PUT /suppliers/portal/profile/:supplierId
 */
export const updateSupplierProfile = async (supplierId, profileData) => {
  if (!isMockMode()) {
    return apiCall(`/suppliers/portal/profile/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    });
  }

  const idx = mockSuppliers.findIndex(s => s.id === supplierId);
  if (idx > -1) {
    mockSuppliers[idx] = { ...mockSuppliers[idx], ...profileData };
    return mockSuppliers[idx];
  }
  return null;
};

// The deployed UI uses the shared snapshot for workflows across roles. The
// legacy endpoint helpers above remain available for integrations that use
// the seeded REST collections, but must not be mixed into this shared workflow.
export const getSharedSupplierPortalStats = (supplierId) => {
  const myRfqs = mockRfqs.filter((rfq) => rfq.supplierId === supplierId);
  const myQuotes = mockQuotations.filter((quote) => quote.supplierId === supplierId);
  const myPos = supplierVisiblePos(supplierId);
  return {
    pendingRfqs: myRfqs.filter((rfq) => rfq.status === 'pending').length,
    submittedQuotations: myQuotes.length,
    purchaseOrdersReceived: myPos.length,
    activeOrders: myPos.filter((po) => ['sent', 'accepted', 'in_transit'].includes(po.status)).length,
    completedOrders: myPos.filter((po) => ['delivered', 'closed'].includes(po.status)).length,
  };
};

export const getSharedSupplierRfqs = (supplierId, statusFilter = '') => {
  const content = mockRfqs.filter((rfq) => rfq.supplierId === supplierId
    && (!statusFilter || rfq.status === statusFilter));
  return { content, totalElements: content.length };
};

export const getSharedSupplierQuotations = (supplierId, statusFilter = '') =>
  mockQuotations.filter((quote) => quote.supplierId === supplierId
    && (!statusFilter || quote.status === statusFilter));

export const getSharedSupplierPurchaseOrders = (supplierId, statusFilter = '') => {
  const content = supplierVisiblePos(supplierId)
    .filter((po) => !statusFilter || po.status === statusFilter);
  return { content, totalElements: content.length };
};

export const getSharedSupplierPayments = (supplierId) => {
  const supplierName = mockSuppliers.find((supplier) => supplier.id === supplierId)?.companyName;
  return mockPayments
    .filter((payment) => payment.supplierId === supplierId
      || (supplierName && payment.supplierName === supplierName))
    .sort((a, b) => new Date(b.createdAt || b.paidDate || 0) - new Date(a.createdAt || a.paidDate || 0));
};

export const updateSharedProductAvailability = (rfqId, availability, user) =>
  storeUpdateRfqAvailability(rfqId, availability, user);

export const declineSharedRfq = (rfqId, reason, remarks, user) =>
  declineSupplierRfq(rfqId, reason, remarks, user);

export const submitSharedQuotation = (quotation, user) => storeSubmitQuotation(quotation, user);

export const acceptSharedPurchaseOrder = (poId, user) => acceptSupplierPurchaseOrder(poId, user);

export const rejectSharedPurchaseOrder = (poId, reason, user) =>
  rejectSupplierPurchaseOrder(poId, reason, user);

export const updateSharedOrderStatus = (poId, status, user) =>
  updateSupplierPurchaseOrderStatus(poId, status, user);

export const getSharedSupplierProfile = (supplierId) =>
  mockSuppliers.find((supplier) => supplier.id === supplierId) || null;

export const updateSharedSupplierProfile = (supplierId, profile, user) =>
  updateSupplierCompanyProfile(supplierId, profile, user);

/** Uploads the actual PDF and atomically updates the shared PO, payment and finance notification. */
export const uploadSharedInvoice = async (poId, invoiceData) => {
  if (!API_BASE_URL) {
    throw new Error('Invoice file upload needs the configured Spring Boot backend.');
  }
  const form = new FormData();
  form.set('supplierId', invoiceData.supplierId);
  form.set('invoiceNumber', invoiceData.invoiceNumber);
  form.set('invoiceAmount', String(invoiceData.invoiceAmount));
  form.set('invoiceDate', invoiceData.invoiceDate);
  form.set('file', invoiceData.file, invoiceData.file.name);
  const token = localStorage.getItem('eps_token');
  const response = await fetch(`${API_BASE_URL}/demo-state/invoices/${encodeURIComponent(poId)}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Invoice upload failed (HTTP ${response.status}).`);
  applyServerSnapshot(result);
  return result.data.purchaseOrders.find((po) => po.id === poId);
};

export const sharedInvoiceFileUrl = (fileId) =>
  fileId && API_BASE_URL
    ? `${API_BASE_URL}/demo-state/invoices/${encodeURIComponent(fileId)}`
    : null;
