import { API_BASE_URL } from './apiBaseUrl'

function notifySessionExpired() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent('smartpos:session-expired'))
}

async function request(path, options = {}) {
  const { suppressAuthEvent = false, ...fetchOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers ?? {}),
    },
    ...fetchOptions,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const body =
    contentType.includes('application/json') && response.status !== 204
      ? await response.json()
      : null

  if (!response.ok) {
    if (response.status === 401 && !suppressAuthEvent) {
      notifySessionExpired()
    }
    const message =
      body?.message ??
      `Request failed (${response.status}) for ${options.method ?? 'GET'} ${path}`
    const error = new Error(message)
    error.status = response.status
    error.isAuthError = response.status === 401
    throw error
  }

  return body
}

async function requestText(path, options = {}) {
  const { suppressAuthEvent = false, ...fetchOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...fetchOptions,
  })

  const body = await response.text()
  if (!response.ok) {
    if (response.status === 401 && !suppressAuthEvent) {
      notifySessionExpired()
    }
    const error = new Error(
      body || `Request failed (${response.status}) for ${options.method ?? 'GET'} ${path}`,
    )
    error.status = response.status
    error.isAuthError = response.status === 401
    throw error
  }

  return body
}

function buildQuery(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    search.set(key, String(value))
  }
  return search.toString()
}

export const posApi = {
  async login(payload) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async logout() {
    return request('/api/auth/logout', {
      method: 'POST',
    })
  },

  async getCurrentSession() {
    return request('/api/auth/me', { suppressAuthEvent: true })
  },

  async searchProducts(query) {
    const params = new URLSearchParams()
    if (query.trim()) {
      params.set('q', query.trim())
    }

    const data = await request(`/api/products/search?${params.toString()}`)
    return data?.items ?? []
  },

  async getProductCatalog({
    q,
    take = 80,
    includeInactive = false,
    lowStockThreshold = 5,
  } = {}) {
    const query = buildQuery({
      q,
      take,
      include_inactive: includeInactive,
      low_stock_threshold: lowStockThreshold,
    })
    const data = await request(`/api/products/catalog?${query}`)
    return data?.items ?? []
  },

  async createProduct(payload) {
    return request('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateProduct(productId, payload) {
    return request(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async adjustProductStock(productId, payload) {
    return request(`/api/products/${productId}/stock-adjustments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getCategories({ includeInactive = false } = {}) {
    const query = buildQuery({ include_inactive: includeInactive })
    const data = await request(`/api/categories?${query}`)
    return data?.items ?? []
  },

  async createCategory(payload) {
    return request('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async updateCategory(categoryId, payload) {
    return request(`/api/categories/${categoryId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async getHeldSales() {
    const data = await request('/api/checkout/held')
    return data?.items ?? []
  },

  async getHeldSale(saleId) {
    return request(`/api/checkout/held/${saleId}`)
  },

  async getSalesHistory(take = 20) {
    const data = await request(`/api/checkout/history?take=${take}`)
    return data?.items ?? []
  },

  async holdSale(payload) {
    return request('/api/checkout/hold', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async completeSale(payload) {
    return request('/api/checkout/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async voidSale(saleId) {
    return request(`/api/checkout/${saleId}/void`, {
      method: 'POST',
    })
  },

  async getReceipt(saleId) {
    return request(`/api/receipts/${saleId}`)
  },

  async getThermalReceiptText(saleId) {
    return requestText(`/api/receipts/${saleId}/thermal`)
  },

  async getWhatsappReceiptLink(saleId, phone) {
    const params = new URLSearchParams()
    if (phone?.trim()) {
      params.set('phone', phone.trim())
    }
    return request(`/api/receipts/${saleId}/whatsapp?${params.toString()}`)
  },

  async getSaleRefundSummary(saleId) {
    return request(`/api/refunds/sale/${saleId}`)
  },

  async createRefund(payload) {
    return request('/api/refunds', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getDailySalesReport({ from, to } = {}) {
    const query = buildQuery({ from, to })
    return request(`/api/reports/daily?${query}`)
  },

  async getTransactionsReport({ from, to, take = 20 } = {}) {
    const query = buildQuery({ from, to, take })
    return request(`/api/reports/transactions?${query}`)
  },

  async getPaymentBreakdownReport({ from, to } = {}) {
    const query = buildQuery({ from, to })
    return request(`/api/reports/payment-breakdown?${query}`)
  },

  async getTopItemsReport({ from, to, take = 10 } = {}) {
    const query = buildQuery({ from, to, take })
    return request(`/api/reports/top-items?${query}`)
  },

  async getLowStockReport({ take = 20, threshold = 5 } = {}) {
    const query = buildQuery({ take, threshold })
    return request(`/api/reports/low-stock?${query}`)
  },
}
