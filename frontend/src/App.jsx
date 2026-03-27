import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildStatusCounts,
  clearSyncErrors,
  createQueuedEvent,
  enqueueEvent,
  getAllEvents,
  getSyncErrors,
} from './lib/offlineSyncStore'
import { posApi } from './lib/posApi'
import { syncPendingEvents } from './lib/syncEngine'

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner', discountLimit: 100 },
  { value: 'manager', label: 'Manager', discountLimit: 25 },
  { value: 'cashier', label: 'Cashier', discountLimit: 10 },
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'lankaqr', label: 'LankaQR' },
]

const ONBOARDING_DISMISSED_KEY = 'smartpos-onboarding-dismissed'
const DEVICE_ID_STORAGE_KEY = 'smartpos-device-id'
const EMPTY_SYNC_COUNTS = {
  total: 0,
  pending: 0,
  synced: 0,
  conflict: 0,
  rejected: 0,
}

function readOnboardingDismissed() {
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1'
}

function getOrCreateDeviceId() {
  if (typeof window === 'undefined') {
    return crypto.randomUUID()
  }

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const nextValue = crypto.randomUUID()
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextValue)
  return nextValue
}

function toMoney(value) {
  return Number(value).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function dateInputValueDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function emptyPayment(method = 'cash') {
  return {
    id: crypto.randomUUID(),
    method,
    amount: '',
    reference: '',
  }
}

function emptyCategoryDraft() {
  return {
    name: '',
    description: '',
    is_active: true,
  }
}

function emptyProductDraft() {
  return {
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    unit_price: '',
    cost_price: '',
    initial_stock_quantity: '0',
    reorder_level: '5',
    allow_negative_stock: true,
    is_active: true,
    stock_adjust_delta: '',
    stock_adjust_reason: 'manual_adjustment',
  }
}

function emptyLoginDraft() {
  return {
    username: 'manager',
    password: 'manager123',
  }
}

function canRefundSale(status) {
  return status === 'completed' || status === 'refundedpartially'
}

function paymentMethodLabel(method) {
  switch ((method ?? '').toLowerCase()) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'lankaqr':
      return 'LankaQR'
    default:
      return method
  }
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function printThermalReceipt(saleId) {
  const text = await posApi.getThermalReceiptText(saleId)
  const printWindow = window.open('', '_blank', 'width=420,height=700')
  if (!printWindow) {
    throw new Error('Print window was blocked by browser.')
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body { margin: 0; padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
          pre { white-space: pre-wrap; font-size: 12px; line-height: 1.35; margin: 0; }
        </style>
      </head>
      <body>
        <pre>${escapeHtml(text)}</pre>
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

function App() {
  const [currentSession, setCurrentSession] = useState(null)
  const [loginDraft, setLoginDraft] = useState(emptyLoginDraft)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [cartItems, setCartItems] = useState([])
  const [role, setRole] = useState('cashier')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [payments, setPayments] = useState([emptyPayment('cash')])
  const [heldBills, setHeldBills] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [refundDraft, setRefundDraft] = useState(null)
  const [isRefundSubmitting, setIsRefundSubmitting] = useState(false)
  const [currentSaleId, setCurrentSaleId] = useState(null)
  const [receiptPhone, setReceiptPhone] = useState('')
  const [lastCompletedSale, setLastCompletedSale] = useState(null)
  const [reportFrom, setReportFrom] = useState(dateInputValueDaysAgo(6))
  const [reportTo, setReportTo] = useState(dateInputValueDaysAgo(0))
  const [reports, setReports] = useState({
    daily: null,
    transactions: null,
    paymentBreakdown: null,
    topItems: null,
    lowStock: null,
  })
  const [catalogQuery, setCatalogQuery] = useState('')
  const [productCatalog, setProductCatalog] = useState([])
  const [categories, setCategories] = useState([])
  const [isCatalogLoading, setIsCatalogLoading] = useState(false)
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(false)
  const [productDraft, setProductDraft] = useState(emptyProductDraft)
  const [categoryDraft, setCategoryDraft] = useState(emptyCategoryDraft)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [isAdjustingStock, setIsAdjustingStock] = useState(false)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [isOnboardingVisible, setIsOnboardingVisible] = useState(
    () => !readOnboardingDismissed(),
  )
  const [syncCounts, setSyncCounts] = useState(EMPTY_SYNC_COUNTS)
  const [syncErrors, setSyncErrors] = useState([])
  const [syncDiagnosticsError, setSyncDiagnosticsError] = useState('')
  const [isSyncStatusLoading, setIsSyncStatusLoading] = useState(false)
  const [isSyncingNow, setIsSyncingNow] = useState(false)
  const [lastSyncSummary, setLastSyncSummary] = useState(null)
  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const roleConfig = useMemo(
    () => ROLE_OPTIONS.find((option) => option.value === role) ?? ROLE_OPTIONS[2],
    [role],
  )

  const discount = Number(discountPercent || '0')
  const discountValid = discount >= 0 && discount <= roleConfig.discountLimit

  const subtotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + Number(item.unit_price) * Number(item.quantity),
        0,
      ),
    [cartItems],
  )
  const discountTotal = useMemo(
    () => (discountValid ? (subtotal * discount) / 100 : 0),
    [discountValid, subtotal, discount],
  )
  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discountTotal),
    [subtotal, discountTotal],
  )
  const paidTotal = useMemo(
    () =>
      payments.reduce((sum, payment) => {
        const amount = Number(payment.amount || '0')
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0),
    [payments],
  )
  const dueAmount = Math.max(0, grandTotal - paidTotal)
  const changeAmount = Math.max(0, paidTotal - grandTotal)
  const refundSaleItemsById = useMemo(() => {
    if (!refundDraft) {
      return new Map()
    }
    return new Map(refundDraft.sale.items.map((item) => [item.sale_item_id, item]))
  }, [refundDraft])

  const refundSelection = useMemo(() => {
    if (!refundDraft) {
      return {
        selectedCount: 0,
        selectedTotal: 0,
        hasInvalidInput: false,
        hasRefundableItems: false,
      }
    }

    const refundableById = new Map(
      refundDraft.summary.items.map((item) => [
        item.sale_item_id,
        Number(item.refundable_quantity),
      ]),
    )

    let selectedCount = 0
    let selectedTotal = 0
    let hasInvalidInput = false

    for (const [saleItemId, rawValue] of Object.entries(refundDraft.quantities)) {
      if (rawValue === '') {
        continue
      }

      const quantity = Number(rawValue)
      if (!Number.isFinite(quantity) || quantity < 0) {
        hasInvalidInput = true
        break
      }

      if (quantity === 0) {
        continue
      }

      const maxRefundable = refundableById.get(saleItemId) ?? 0
      if (quantity > maxRefundable) {
        hasInvalidInput = true
        break
      }

      const saleItem = refundSaleItemsById.get(saleItemId)
      const soldQty = Number(saleItem?.quantity ?? 0)
      const lineTotal = Number(saleItem?.line_total ?? 0)
      const unitTotal = soldQty > 0 ? lineTotal / soldQty : 0

      selectedCount += 1
      selectedTotal += unitTotal * quantity
    }

    return {
      selectedCount,
      selectedTotal,
      hasInvalidInput,
      hasRefundableItems: refundDraft.summary.items.some(
        (item) => Number(item.refundable_quantity) > 0,
      ),
    }
  }, [refundDraft, refundSaleItemsById])

  const lowStockAlertCount = reports.lowStock?.items?.length ?? 0
  const canManageInventory =
    currentSession?.role === 'owner' || currentSession?.role === 'manager'

  const loadCurrentSession = useCallback(async () => {
    setIsSessionLoading(true)
    try {
      const session = await posApi.getCurrentSession()
      setCurrentSession(session)
    } catch (error) {
      if (error?.isAuthError) {
        setCurrentSession(null)
      } else {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load current session.',
        )
      }
    } finally {
      setIsSessionLoading(false)
    }
  }, [])

  const loadHeldBills = useCallback(async () => {
    const bills = await posApi.getHeldSales()
    setHeldBills(bills)
  }, [])

  const loadRecentSales = useCallback(async () => {
    const sales = await posApi.getSalesHistory(15)
    setRecentSales(sales)
  }, [])

  const loadReports = useCallback(async () => {
    setIsReportsLoading(true)
    try {
      const query = {
        from: reportFrom || undefined,
        to: reportTo || undefined,
      }

      const [daily, transactions, paymentBreakdown, topItems, lowStock] =
        await Promise.all([
          posApi.getDailySalesReport(query),
          posApi.getTransactionsReport({ ...query, take: 20 }),
          posApi.getPaymentBreakdownReport(query),
          posApi.getTopItemsReport({ ...query, take: 10 }),
          posApi.getLowStockReport({ take: 20, threshold: 5 }),
        ])

      setReports({
        daily,
        transactions,
        paymentBreakdown,
        topItems,
        lowStock,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load reports.')
    } finally {
      setIsReportsLoading(false)
    }
  }, [reportFrom, reportTo])

  const loadCategories = useCallback(async () => {
    setIsCategoriesLoading(true)
    try {
      const items = await posApi.getCategories({ includeInactive: true })
      setCategories(items)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load categories.')
    } finally {
      setIsCategoriesLoading(false)
    }
  }, [])

  const loadProductCatalog = useCallback(
    async (queryOverride = null) => {
      const query = queryOverride ?? catalogQuery
      setIsCatalogLoading(true)
      try {
        const items = await posApi.getProductCatalog({
          q: query || undefined,
          take: 100,
          includeInactive: true,
          lowStockThreshold: 5,
        })
        setProductCatalog(items)
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load product catalog.',
        )
      } finally {
        setIsCatalogLoading(false)
      }
    },
    [catalogQuery],
  )

  const loadSyncDiagnostics = useCallback(async () => {
    setIsSyncStatusLoading(true)
    setSyncDiagnosticsError('')

    try {
      const [events, errors] = await Promise.all([getAllEvents(), getSyncErrors()])
      setSyncCounts(buildStatusCounts(events))
      setSyncErrors(errors.slice(0, 8))
    } catch (error) {
      setSyncDiagnosticsError(
        error instanceof Error ? error.message : 'Failed to read offline sync status.',
      )
    } finally {
      setIsSyncStatusLoading(false)
    }
  }, [])

  const resolveSyncTestProductId = useCallback(async () => {
    if (cartItems.length > 0) {
      return cartItems[0].product_id
    }

    if (searchResults.length > 0) {
      return searchResults[0].id
    }

    const products = await posApi.searchProducts('')
    if (products.length > 0) {
      return products[0].id
    }

    throw new Error('No products found. Search and add a product to queue an offline test event.')
  }, [cartItems, searchResults])

  const handleSyncNow = useCallback(async () => {
    if (!isOnline) {
      setErrorMessage('Sync is unavailable while offline. Connect and retry.')
      return
    }

    setErrorMessage('')
    setIsSyncingNow(true)
    try {
      const result = await syncPendingEvents()
      setLastSyncSummary({
        ...result,
        timestamp: new Date().toISOString(),
      })
      if (result.processed === 0) {
        setMessage('Sync checked: no pending offline events.')
      } else {
        setMessage(
          `Sync finished: ${result.synced} synced, ${result.conflicted} conflicts, ${result.rejected} rejected.`,
        )
      }
      await loadSyncDiagnostics()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sync failed.')
    } finally {
      setIsSyncingNow(false)
    }
  }, [isOnline, loadSyncDiagnostics])

  const handleQueueSyncTestEvent = useCallback(async () => {
    setErrorMessage('')
    try {
      const productId = await resolveSyncTestProductId()
      const queuedEvent = createQueuedEvent({
        type: 'stock_update',
        payload: {
          product_id: productId,
          delta_quantity: 0,
        },
        deviceId: getOrCreateDeviceId(),
      })
      await enqueueEvent(queuedEvent)
      setMessage(`Offline test event queued (${queuedEvent.event_id.slice(0, 8)}...).`)
      await loadSyncDiagnostics()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to queue offline test event.',
      )
    }
  }, [loadSyncDiagnostics, resolveSyncTestProductId])

  const handleClearSyncErrors = useCallback(async () => {
    setErrorMessage('')
    try {
      await clearSyncErrors()
      setMessage('Sync error log cleared.')
      await loadSyncDiagnostics()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to clear sync errors.')
    }
  }, [loadSyncDiagnostics])

  const dismissOnboarding = () => {
    setIsOnboardingVisible(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1')
    }
  }

  const showOnboarding = () => {
    setIsOnboardingVisible(true)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ONBOARDING_DISMISSED_KEY)
    }
  }

  useEffect(() => {
    void loadCurrentSession()
  }, [loadCurrentSession])

  useEffect(() => {
    if (!currentSession) {
      return
    }

    void loadHeldBills()
    void loadRecentSales()
    if (canManageInventory) {
      void loadReports()
      void loadCategories()
      void loadProductCatalog()
    }
    void loadSyncDiagnostics()
  }, [
    currentSession,
    canManageInventory,
    loadHeldBills,
    loadRecentSales,
    loadReports,
    loadCategories,
    loadProductCatalog,
    loadSyncDiagnostics,
  ])

  useEffect(() => {
    const handleSessionExpired = () => {
      setCurrentSession(null)
      setErrorMessage('Session expired. Please sign in again.')
    }

    window.addEventListener('smartpos:session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('smartpos:session-expired', handleSessionExpired)
    }
  }, [])

  useEffect(() => {
    const handleConnectivityChange = () => {
      setIsOnline(navigator.onLine)
    }

    window.addEventListener('online', handleConnectivityChange)
    window.addEventListener('offline', handleConnectivityChange)

    return () => {
      window.removeEventListener('online', handleConnectivityChange)
      window.removeEventListener('offline', handleConnectivityChange)
    }
  }, [])

  const handleSearch = async () => {
    setErrorMessage('')
    setIsSearching(true)
    try {
      const products = await posApi.searchProducts(searchTerm)
      setSearchResults(products)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setIsSearching(false)
    }
  }

  const addToCart = (product) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.product_id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          barcode: product.barcode,
          unit_price: Number(product.unitPrice),
          stock_quantity: Number(product.stockQuantity),
          quantity: 1,
        },
      ]
    })
  }

  const setItemQuantity = (productId, quantity) => {
    setCartItems((current) =>
      current
        .map((item) =>
          item.product_id === productId
            ? { ...item, quantity: Math.max(0, Number(quantity)) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (productId) => {
    setCartItems((current) => current.filter((item) => item.product_id !== productId))
  }

  const clearCurrentBill = () => {
    setCartItems([])
    setDiscountPercent('0')
    setPayments([emptyPayment('cash')])
    setCurrentSaleId(null)
  }

  const holdBill = async () => {
    if (cartItems.length === 0) {
      setErrorMessage('Add items before holding a bill.')
      return
    }
    if (!discountValid) {
      setErrorMessage(`Discount exceeds ${roleConfig.discountLimit}% for ${role}.`)
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsSubmitting(true)
    try {
      const result = await posApi.holdSale({
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
        discount_percent: discount,
        role,
      })
      setMessage(`Bill held as ${result.sale_number}.`)
      clearCurrentBill()
      await loadHeldBills()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to hold bill.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resumeHeldBill = async (saleId) => {
    setErrorMessage('')
    setMessage('')
    try {
      const bill = await posApi.getHeldSale(saleId)
      setCurrentSaleId(bill.sale_id)
      setCartItems(
        bill.items.map((item) => ({
          product_id: item.product_id,
          name: item.product_name,
          barcode: null,
          unit_price: Number(item.unit_price),
          stock_quantity: 0,
          quantity: Number(item.quantity),
        })),
      )
      setDiscountPercent(String(bill.discount_percent ?? 0))
      setPayments([emptyPayment('cash')])
      setMessage(`Resumed ${bill.sale_number}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to resume bill.')
    }
  }

  const voidOrCancel = async () => {
    setErrorMessage('')
    setMessage('')

    if (!currentSaleId) {
      clearCurrentBill()
      setMessage('Draft bill cancelled.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await posApi.voidSale(currentSaleId)
      clearCurrentBill()
      await Promise.all([loadHeldBills(), loadRecentSales()])
      setMessage(`Sale ${result.sale_number} was voided before payment.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to void bill.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updatePayment = (id, patch) => {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id ? { ...payment, ...patch } : payment,
      ),
    )
  }

  const removePayment = (id) => {
    setPayments((current) => {
      if (current.length === 1) {
        return current
      }
      return current.filter((payment) => payment.id !== id)
    })
  }

  const completeSale = async () => {
    if (cartItems.length === 0) {
      setErrorMessage('Cart is empty.')
      return
    }
    if (!discountValid) {
      setErrorMessage(`Discount exceeds ${roleConfig.discountLimit}% for ${role}.`)
      return
    }
    if (dueAmount > 0) {
      setErrorMessage('Payment is not enough to complete this sale.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    setMessage('')

    try {
      const payload = {
        sale_id: currentSaleId,
        items: cartItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
        })),
        discount_percent: discount,
        role,
        payments: payments
          .filter((payment) => Number(payment.amount || '0') > 0)
          .map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
            reference_number: payment.reference || null,
          })),
      }

      const result = await posApi.completeSale(payload)
      setLastCompletedSale({
        sale_id: result.sale_id,
        sale_number: result.sale_number,
      })
      setMessage(
        `Sale completed (${result.sale_number}). Total LKR ${toMoney(result.grand_total)}, change LKR ${toMoney(result.change)}.`,
      )
      clearCurrentBill()
      await Promise.all([loadHeldBills(), loadRecentSales()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Checkout failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePrintReceipt = async (saleId) => {
    setErrorMessage('')
    try {
      await printThermalReceipt(saleId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to print receipt.')
    }
  }

  const handleShareReceipt = async (saleId) => {
    setErrorMessage('')
    try {
      const result = await posApi.getWhatsappReceiptLink(saleId, receiptPhone)
      window.open(result.url, '_blank', 'noopener,noreferrer')
      setMessage('WhatsApp receipt link opened in a new tab.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to share receipt.')
    }
  }

  const openRefundDraft = async (saleId) => {
    setErrorMessage('')
    setMessage('')
    try {
      const [sale, summary] = await Promise.all([
        posApi.getReceipt(saleId),
        posApi.getSaleRefundSummary(saleId),
      ])

      const quantities = {}
      for (const item of summary.items) {
        quantities[item.sale_item_id] = ''
      }

      setRefundDraft({
        sale,
        summary,
        reason: 'customer_request',
        quantities,
      })
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load refund details.',
      )
    }
  }

  const updateRefundQty = (saleItemId, value) => {
    setRefundDraft((current) =>
      current
        ? {
            ...current,
            quantities: {
              ...current.quantities,
              [saleItemId]: value,
            },
          }
        : current,
    )
  }

  const submitRefund = async () => {
    if (!refundDraft) {
      return
    }

    const refundableById = new Map(
      refundDraft.summary.items.map((item) => [
        item.sale_item_id,
        Number(item.refundable_quantity),
      ]),
    )

    const items = []
    for (const [saleItemId, rawQuantity] of Object.entries(refundDraft.quantities)) {
      const quantity = Number(rawQuantity || '0')
      if (!Number.isFinite(quantity) || quantity < 0) {
        setErrorMessage('Refund quantity must be zero or greater.')
        return
      }

      if (quantity === 0) {
        continue
      }

      const maxRefundable = refundableById.get(saleItemId) ?? 0
      if (quantity > maxRefundable) {
        setErrorMessage('Refund quantity cannot exceed refundable quantity.')
        return
      }

      items.push({
        sale_item_id: saleItemId,
        quantity,
      })
    }

    if (items.length === 0) {
      setErrorMessage('Enter at least one refund quantity.')
      return
    }

    if (Number(refundDraft.summary.remaining_refundable_total) <= 0) {
      setErrorMessage('This sale has no refundable balance remaining.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsRefundSubmitting(true)
    const reason = refundDraft.reason?.trim() || 'customer_request'

    try {
      const result = await posApi.createRefund({
        sale_id: refundDraft.summary.sale_id,
        reason,
        items,
      })

      const [sale, summary] = await Promise.all([
        posApi.getReceipt(refundDraft.summary.sale_id),
        posApi.getSaleRefundSummary(refundDraft.summary.sale_id),
      ])

      const quantities = {}
      for (const item of summary.items) {
        quantities[item.sale_item_id] = ''
      }

      setRefundDraft({
        sale,
        summary,
        reason,
        quantities,
      })
      setMessage(
        `Refund ${result.refund_number} created. Reversed LKR ${toMoney(result.grand_total)}.`,
      )
      await loadRecentSales()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Refund failed.')
    } finally {
      setIsRefundSubmitting(false)
    }
  }

  const resetCategoryEditor = () => {
    setCategoryDraft(emptyCategoryDraft())
    setEditingCategoryId(null)
  }

  const startCategoryEdit = (category) => {
    setEditingCategoryId(category.category_id)
    setCategoryDraft({
      name: category.name ?? '',
      description: category.description ?? '',
      is_active: Boolean(category.is_active),
    })
  }

  const saveCategory = async () => {
    const name = categoryDraft.name.trim()
    if (!name) {
      setErrorMessage('Category name is required.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsSavingCategory(true)

    try {
      const payload = {
        name,
        description: categoryDraft.description.trim() || null,
        is_active: categoryDraft.is_active,
      }

      if (editingCategoryId) {
        await posApi.updateCategory(editingCategoryId, payload)
        setMessage('Category updated.')
      } else {
        await posApi.createCategory(payload)
        setMessage('Category created.')
      }

      resetCategoryEditor()
      await Promise.all([loadCategories(), loadProductCatalog(catalogQuery)])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save category.')
    } finally {
      setIsSavingCategory(false)
    }
  }

  const resetProductEditor = () => {
    setProductDraft(emptyProductDraft())
    setEditingProductId(null)
  }

  const startProductEdit = (product) => {
    setEditingProductId(product.product_id)
    setProductDraft({
      name: product.name ?? '',
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      category_id: product.category_id ?? '',
      unit_price: String(product.unit_price ?? ''),
      cost_price: String(product.cost_price ?? ''),
      initial_stock_quantity: '0',
      reorder_level: String(product.reorder_level ?? '0'),
      allow_negative_stock: Boolean(product.allow_negative_stock),
      is_active: Boolean(product.is_active),
      stock_adjust_delta: '',
      stock_adjust_reason: 'manual_adjustment',
    })
  }

  const saveProduct = async () => {
    const name = productDraft.name.trim()
    if (!name) {
      setErrorMessage('Product name is required.')
      return
    }

    const unitPrice = Number(productDraft.unit_price)
    const costPrice = Number(productDraft.cost_price)
    const reorderLevel = Number(productDraft.reorder_level)
    const initialStock = Number(productDraft.initial_stock_quantity)

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setErrorMessage('Unit price must be zero or greater.')
      return
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setErrorMessage('Cost price must be zero or greater.')
      return
    }

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      setErrorMessage('Reorder level must be zero or greater.')
      return
    }

    if (!editingProductId && (!Number.isFinite(initialStock) || initialStock < 0)) {
      setErrorMessage('Initial stock must be zero or greater.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsSavingProduct(true)

    try {
      const basePayload = {
        name,
        sku: productDraft.sku.trim() || null,
        barcode: productDraft.barcode.trim() || null,
        category_id: productDraft.category_id || null,
        unit_price: unitPrice,
        cost_price: costPrice,
        reorder_level: reorderLevel,
        allow_negative_stock: productDraft.allow_negative_stock,
        is_active: productDraft.is_active,
      }

      if (editingProductId) {
        await posApi.updateProduct(editingProductId, basePayload)
        setMessage('Product updated.')
      } else {
        await posApi.createProduct({
          ...basePayload,
          initial_stock_quantity: initialStock,
        })
        setMessage('Product created.')
        resetProductEditor()
      }

      await Promise.all([
        loadProductCatalog(catalogQuery),
        loadReports(),
        loadRecentSales(),
      ])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save product.')
    } finally {
      setIsSavingProduct(false)
    }
  }

  const applyStockAdjustment = async () => {
    if (!editingProductId) {
      setErrorMessage('Select a product before applying stock adjustments.')
      return
    }

    const delta = Number(productDraft.stock_adjust_delta)
    if (!Number.isFinite(delta) || delta === 0) {
      setErrorMessage('Stock delta must be a non-zero number.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsAdjustingStock(true)
    try {
      const reason = productDraft.stock_adjust_reason.trim() || 'manual_adjustment'
      const result = await posApi.adjustProductStock(editingProductId, {
        delta_quantity: delta,
        reason,
      })

      setProductDraft((current) => ({
        ...current,
        stock_adjust_delta: '',
      }))
      setMessage(`Stock adjusted. New quantity: ${toMoney(result.new_quantity)}.`)
      await Promise.all([loadProductCatalog(catalogQuery), loadReports()])
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to apply stock adjustment.',
      )
    } finally {
      setIsAdjustingStock(false)
    }
  }

  const handleCatalogSearch = async () => {
    setErrorMessage('')
    await loadProductCatalog(catalogQuery)
  }

  const handleLogin = async () => {
    const username = loginDraft.username.trim()
    const password = loginDraft.password
    if (!username || !password) {
      setErrorMessage('Username and password are required.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsLoggingIn(true)
    try {
      await posApi.login({
        username,
        password,
        device_code: getOrCreateDeviceId(),
        device_name:
          typeof navigator === 'undefined'
            ? 'POS Browser'
            : navigator.userAgent.slice(0, 120),
      })
      const session = await posApi.getCurrentSession()
      setCurrentSession(session)
      setMessage(`Signed in as ${session.full_name} (${session.role}).`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = async () => {
    setErrorMessage('')
    setMessage('')
    setIsLoggingOut(true)
    try {
      await posApi.logout()
      setCurrentSession(null)
      setMessage('Signed out successfully.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Logout failed.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-brand-50/40 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">SmartPOS Lanka</h1>
          <p className="mt-2 text-sm text-slate-600">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-brand-50/40 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            SmartPOS Lanka
          </p>
          <h1 className="mt-1 text-2xl font-bold">Sign In</h1>
          <p className="mt-2 text-sm text-slate-600">
            Use your role account to continue. Demo users: `owner`, `manager`, `cashier`.
          </p>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Username</span>
            <input
              type="text"
              value={loginDraft.username}
              onChange={(event) =>
                setLoginDraft((current) => ({ ...current, username: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-700"
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input
              type="password"
              value={loginDraft.password}
              onChange={(event) =>
                setLoginDraft((current) => ({ ...current, password: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-700"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isLoggingIn}
            className="mt-4 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {isLoggingIn ? 'Signing In...' : 'Sign In'}
          </button>

          {errorMessage ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-brand-50/40 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            SmartPOS Lanka
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            One-Screen Checkout
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Search products, bill fast, hold/resume, complete split payments,
            then print thermal receipts or share through WhatsApp.
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <p>
              Signed in as <strong>{currentSession.full_name}</strong> (
              {currentSession.role}) on device {currentSession.device_code}.
            </p>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-200 disabled:opacity-60"
            >
              {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">
                Customer WhatsApp (optional)
              </span>
              <input
                type="text"
                value={receiptPhone}
                onChange={(event) => setReceiptPhone(event.target.value)}
                placeholder="94771234567"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-700"
              />
            </label>
            <div className="flex items-end">
              {lastCompletedSale ? (
                <div className="flex w-full flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handlePrintReceipt(lastCompletedSale.sale_id)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    Print Latest
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareReceipt(lastCompletedSale.sale_id)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-600"
                  >
                    WhatsApp Latest
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {message ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
          {lowStockAlertCount > 0 ? (
            <p
              data-testid="low-stock-alert-banner"
              className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              Low stock alert: {lowStockAlertCount} product
              {lowStockAlertCount === 1 ? '' : 's'} at or below alert level.
            </p>
          ) : null}
        </header>

        <div className="grid gap-4 xl:grid-cols-3">
          <section
            data-testid="offline-sync-panel"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Launch Readiness</h2>
                <p className="text-xs text-slate-500">
                  Device network status and offline sync diagnostics for this POS terminal.
                </p>
              </div>
              <span
                data-testid="network-status-badge"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isOnline
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              <article className="rounded-xl bg-slate-100 p-2">
                <p className="text-[11px] text-slate-600">Total</p>
                <p className="text-lg font-semibold">{syncCounts.total}</p>
              </article>
              <article className="rounded-xl bg-slate-100 p-2">
                <p className="text-[11px] text-slate-600">Pending</p>
                <p data-testid="sync-count-pending" className="text-lg font-semibold">
                  {syncCounts.pending}
                </p>
              </article>
              <article className="rounded-xl bg-slate-100 p-2">
                <p className="text-[11px] text-slate-600">Synced</p>
                <p className="text-lg font-semibold">{syncCounts.synced}</p>
              </article>
              <article className="rounded-xl bg-slate-100 p-2">
                <p className="text-[11px] text-slate-600">Conflict</p>
                <p className="text-lg font-semibold">{syncCounts.conflict}</p>
              </article>
              <article className="rounded-xl bg-slate-100 p-2">
                <p className="text-[11px] text-slate-600">Rejected</p>
                <p className="text-lg font-semibold">{syncCounts.rejected}</p>
              </article>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadSyncDiagnostics()}
                disabled={isSyncStatusLoading}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
              >
                {isSyncStatusLoading ? 'Refreshing...' : 'Refresh Sync Status'}
              </button>
              <button
                type="button"
                onClick={() => void handleQueueSyncTestEvent()}
                className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-900 hover:bg-brand-100"
              >
                Queue Test Offline Event
              </button>
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={isSyncingNow || !isOnline}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncingNow ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                type="button"
                onClick={() => void handleClearSyncErrors()}
                className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                Clear Sync Errors
              </button>
            </div>

            {lastSyncSummary ? (
              <p className="mt-3 text-xs text-slate-600">
                Last sync at{' '}
                {new Date(lastSyncSummary.timestamp).toLocaleString('en-LK')}: processed{' '}
                {lastSyncSummary.processed}, synced {lastSyncSummary.synced}, conflicts{' '}
                {lastSyncSummary.conflicted}, rejected {lastSyncSummary.rejected}.
              </p>
            ) : null}

            {syncDiagnosticsError ? (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {syncDiagnosticsError}
              </p>
            ) : null}

            <article className="mt-3 rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Recent Sync Errors</h3>
              <div className="mt-2 space-y-1">
                {syncErrors.map((error, index) => (
                  <p
                    key={`${error.id ?? error.created_at ?? index}`}
                    className="text-xs text-slate-600"
                  >
                    {new Date(error.created_at).toLocaleString('en-LK')} | {error.error}
                  </p>
                ))}
                {syncErrors.length === 0 ? (
                  <p className="text-xs text-slate-500">No sync errors recorded.</p>
                ) : null}
              </div>
            </article>
          </section>

          {isOnboardingVisible ? (
            <section
              data-testid="onboarding-panel"
              className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-brand-900">Quick Onboarding</h2>
                  <p className="text-xs text-brand-900/80">
                    New cashier setup in under two minutes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  className="rounded-lg border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-900 hover:bg-brand-100"
                >
                  Dismiss
                </button>
              </div>

              <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-slate-700">
                <li>Search an item and add it to the cart.</li>
                <li>Confirm cashier role and discount limit.</li>
                <li>Enter payment and finish checkout.</li>
                <li>Use Reprint or WhatsApp from Recent Sales.</li>
                <li>When internet returns, run Sync Now and confirm pending is zero.</li>
              </ol>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Onboarding Hidden</h2>
              <p className="mt-1 text-xs text-slate-500">
                Show the quick onboarding steps again for new staff.
              </p>
              <button
                type="button"
                onClick={showOnboarding}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100"
              >
                Show Onboarding
              </button>
            </section>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-5">
            <h2 className="text-lg font-semibold">Product Search</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleSearch()
                  }
                }}
                placeholder="Search by name, SKU, or barcode"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-700"
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                {isSearching ? '...' : 'Search'}
              </button>
            </div>

            <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto pr-1">
              {searchResults.map((product) => (
                <article
                  key={product.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-slate-500">
                        {product.barcode ?? '-'} | stock {product.stockQuantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        LKR {toMoney(product.unitPrice)}
                      </p>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        className="mt-1 rounded-lg bg-brand-700 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Search products to start billing.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Checkout</h2>
              {currentSaleId ? (
                <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
                  Resumed Held Bill
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Role</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-700"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.discountLimit}% max discount)
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Discount %
                </span>
                <input
                  type="number"
                  min="0"
                  max={roleConfig.discountLimit}
                  step="0.01"
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-700"
                />
              </label>
            </div>

            <div className="mt-4 max-h-56 space-y-2 overflow-auto pr-1">
              {cartItems.map((item) => (
                <article
                  key={item.product_id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        LKR {toMoney(item.unit_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setItemQuantity(item.product_id, item.quantity - 1)
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          setItemQuantity(item.product_id, event.target.value)
                        }
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setItemQuantity(item.product_id, item.quantity + 1)
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product_id)}
                        className="rounded border border-rose-300 px-2 py-1 text-sm text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
              {cartItems.length === 0 ? (
                <p className="text-sm text-slate-500">No items in cart.</p>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <strong>LKR {toMoney(subtotal)}</strong>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Discount</span>
                <strong>- LKR {toMoney(discountTotal)}</strong>
              </div>
              <div className="mt-1 flex justify-between text-base">
                <span>Grand Total</span>
                <strong>LKR {toMoney(grandTotal)}</strong>
              </div>
              {!discountValid ? (
                <p className="mt-2 text-xs text-rose-700">
                  Discount is above {roleConfig.discountLimit}% for {roleConfig.label}.
                </p>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Payments</h3>
                <button
                  type="button"
                  onClick={() => setPayments((current) => [...current, emptyPayment()])}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100"
                >
                  Add Payment
                </button>
              </div>

              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="grid gap-2 sm:grid-cols-12">
                    <select
                      value={payment.method}
                      onChange={(event) =>
                        updatePayment(payment.id, { method: event.target.value })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm sm:col-span-3"
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Amount"
                      value={payment.amount}
                      onChange={(event) =>
                        updatePayment(payment.id, { amount: event.target.value })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm sm:col-span-3"
                    />
                    <input
                      type="text"
                      placeholder="Reference (optional)"
                      value={payment.reference}
                      onChange={(event) =>
                        updatePayment(payment.id, { reference: event.target.value })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-2 text-sm sm:col-span-5"
                    />
                    <button
                      type="button"
                      onClick={() => removePayment(payment.id)}
                      className="rounded-lg border border-rose-300 px-2 py-2 text-xs font-medium text-rose-700 sm:col-span-1"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-1 text-xs text-slate-600">
                <p>Paid: LKR {toMoney(paidTotal)}</p>
                <p>Due: LKR {toMoney(dueAmount)}</p>
                <p>Change: LKR {toMoney(changeAmount)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void holdBill()}
                disabled={isSubmitting}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                Hold Bill
              </button>
              <button
                type="button"
                onClick={() => void voidOrCancel()}
                disabled={isSubmitting}
                className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                {currentSaleId ? 'Void Held Bill' : 'Cancel Draft'}
              </button>
              <button
                type="button"
                onClick={() => void completeSale()}
                disabled={isSubmitting}
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                Complete Sale
              </button>
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Held Bills</h2>
              <button
                type="button"
                onClick={() => void loadHeldBills()}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {heldBills.map((bill) => (
                <article
                  key={bill.sale_id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-semibold">{bill.sale_number}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Items: {bill.item_count}
                  </p>
                  <p className="text-xs text-slate-500">
                    Total: LKR {toMoney(bill.grand_total)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void resumeHeldBill(bill.sale_id)}
                    className="mt-2 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                  >
                    Resume
                  </button>
                </article>
              ))}
              {heldBills.length === 0 ? (
                <p className="text-sm text-slate-500">No held bills currently.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent Sales</h2>
              <button
                type="button"
                onClick={() => void loadRecentSales()}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 grid gap-2">
              {recentSales.map((sale) => (
                <article
                  key={sale.sale_id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-semibold">{sale.sale_number}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {sale.status} | LKR {toMoney(sale.grand_total)}
                  </p>
                  {sale.payment_breakdown?.length ? (
                    <div className="mt-1 space-y-0.5">
                      {sale.payment_breakdown.map((payment) => (
                        <p key={`${sale.sale_id}-${payment.method}`} className="text-[11px] text-slate-600">
                          {paymentMethodLabel(payment.method)}: net LKR{' '}
                          {toMoney(payment.net_amount)}
                          {Number(payment.reversed_amount) > 0 ? (
                            <> (reversed LKR {toMoney(payment.reversed_amount)})</>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePrintReceipt(sale.sale_id)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      Reprint
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareReceipt(sale.sale_id)}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                    >
                      WhatsApp
                    </button>
                    {canManageInventory && canRefundSale(sale.status) ? (
                      <button
                        type="button"
                        onClick={() => void openRefundDraft(sale.sale_id)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Refund
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {recentSales.length === 0 ? (
                <p className="text-sm text-slate-500">No completed/voided sales yet.</p>
              ) : null}
            </div>
          </section>
        </div>

        {canManageInventory ? (
          <section
            data-testid="product-inventory-panel"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Product & Inventory</h2>
              <p className="text-xs text-slate-500">
                Manage categories, product details, barcode data, and manual stock
                adjustments.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void Promise.all([loadCategories(), loadProductCatalog(catalogQuery)])
              }}
              disabled={isCatalogLoading || isCategoriesLoading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
            >
              Refresh Catalog
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-12">
            <article className="rounded-xl border border-slate-200 p-3 xl:col-span-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Categories</h3>
                {isCategoriesLoading ? (
                  <span className="text-xs text-slate-500">Loading...</span>
                ) : null}
              </div>

              <div className="mt-2 max-h-56 space-y-1 overflow-auto pr-1">
                {categories.map((category) => (
                  <div
                    key={category.category_id}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {category.name}{' '}
                        {!category.is_active ? (
                          <span className="text-rose-700">(inactive)</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Products: {category.product_count}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startCategoryEdit(category)}
                      className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium hover:bg-slate-100"
                    >
                      Edit
                    </button>
                  </div>
                ))}
                {categories.length === 0 ? (
                  <p className="text-xs text-slate-500">No categories found.</p>
                ) : null}
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-2">
                <h4 className="text-xs font-semibold">
                  {editingCategoryId ? 'Edit Category' : 'Create Category'}
                </h4>
                <label className="mt-2 block text-xs text-slate-600">
                  Name
                  <input
                    type="text"
                    value={categoryDraft.name}
                    onChange={(event) =>
                      setCategoryDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="mt-2 block text-xs text-slate-600">
                  Description
                  <input
                    type="text"
                    value={categoryDraft.description}
                    onChange={(event) =>
                      setCategoryDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={categoryDraft.is_active}
                    onChange={(event) =>
                      setCategoryDraft((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  Active
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveCategory()}
                    disabled={isSavingCategory}
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {isSavingCategory ? 'Saving...' : editingCategoryId ? 'Update' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={resetCategoryEditor}
                    disabled={isSavingCategory}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 p-3 xl:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Catalog & Stock Controls</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleCatalogSearch()
                      }
                    }}
                    placeholder="Search product catalog by name, SKU, barcode"
                    className="w-64 rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:w-80"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCatalogSearch()}
                    disabled={isCatalogLoading}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
                  >
                    {isCatalogLoading ? '...' : 'Search'}
                  </button>
                </div>
              </div>

              <div className="mt-3 max-h-56 space-y-1 overflow-auto pr-1">
                {productCatalog.map((product) => (
                  <div
                    key={product.product_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-2"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {product.name}{' '}
                        {!product.is_active ? (
                          <span className="text-rose-700">(inactive)</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {product.sku ?? '-'} | {product.barcode ?? '-'} | stock{' '}
                        {product.stock_quantity} / alert {product.alert_level}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {product.category_name ?? 'No category'} | LKR{' '}
                        {toMoney(product.unit_price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {product.is_low_stock ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          Low stock
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => startProductEdit(product)}
                        className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium hover:bg-slate-100"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                {productCatalog.length === 0 ? (
                  <p className="text-xs text-slate-500">No catalog items found.</p>
                ) : null}
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 p-3">
                <h4 className="text-sm font-semibold">
                  {editingProductId ? 'Edit Product' : 'Create Product'}
                </h4>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Product Name
                    <input
                      type="text"
                      value={productDraft.name}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Category
                    <select
                      value={productDraft.category_id}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          category_id: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">No category</option>
                      {categories
                        .filter((category) => category.is_active || category.category_id === productDraft.category_id)
                        .map((category) => (
                          <option key={category.category_id} value={category.category_id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    SKU
                    <input
                      type="text"
                      value={productDraft.sku}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          sku: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Barcode
                    <input
                      type="text"
                      value={productDraft.barcode}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          barcode: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Unit Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={productDraft.unit_price}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          unit_price: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Cost Price
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={productDraft.cost_price}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          cost_price: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  {!editingProductId ? (
                    <label className="text-xs text-slate-600">
                      Initial Stock
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={productDraft.initial_stock_quantity}
                        onChange={(event) =>
                          setProductDraft((current) => ({
                            ...current,
                            initial_stock_quantity: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                  ) : null}
                  <label className="text-xs text-slate-600">
                    Reorder Level
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={productDraft.reorder_level}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          reorder_level: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={productDraft.allow_negative_stock}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          allow_negative_stock: event.target.checked,
                        }))
                      }
                    />
                    Allow negative stock
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={productDraft.is_active}
                      onChange={(event) =>
                        setProductDraft((current) => ({
                          ...current,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    Product active
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void saveProduct()}
                    disabled={isSavingProduct}
                    className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {isSavingProduct ? 'Saving...' : editingProductId ? 'Update Product' : 'Create Product'}
                  </button>
                  <button
                    type="button"
                    onClick={resetProductEditor}
                    disabled={isSavingProduct || isAdjustingStock}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
                  >
                    Clear Form
                  </button>
                </div>

                {editingProductId ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <h5 className="text-xs font-semibold">Manual Stock Adjustment</h5>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="text-xs text-slate-600">
                        Delta Quantity
                        <input
                          type="number"
                          step="0.001"
                          value={productDraft.stock_adjust_delta}
                          onChange={(event) =>
                            setProductDraft((current) => ({
                              ...current,
                              stock_adjust_delta: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-600 sm:col-span-2">
                        Reason
                        <input
                          type="text"
                          value={productDraft.stock_adjust_reason}
                          onChange={(event) =>
                            setProductDraft((current) => ({
                              ...current,
                              stock_adjust_reason: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => void applyStockAdjustment()}
                      disabled={isAdjustingStock}
                      className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                    >
                      {isAdjustingStock ? 'Applying...' : 'Apply Adjustment'}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          </div>
          </section>
        ) : null}

        {refundDraft ? (
          <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-amber-900">
                  Refund Draft - {refundDraft.summary.sale_number}
                </h2>
                <p className="text-xs text-slate-500">
                  Status: {refundDraft.summary.sale_status} | Refunded LKR{' '}
                  {toMoney(refundDraft.summary.refunded_total)} | Remaining LKR{' '}
                  {toMoney(refundDraft.summary.remaining_refundable_total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefundDraft(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Reason</span>
              <input
                type="text"
                value={refundDraft.reason}
                onChange={(event) =>
                  setRefundDraft((current) =>
                    current
                      ? {
                          ...current,
                          reason: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder="customer_request"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
            </label>

            <div className="mt-3 grid gap-2">
              {refundDraft.summary.items.map((item) => {
                const saleItem = refundSaleItemsById.get(item.sale_item_id)
                const soldQty = Number(item.sold_quantity || '0')
                const lineTotal = Number(saleItem?.line_total ?? 0)
                const unitTotal = soldQty > 0 ? lineTotal / soldQty : 0

                return (
                  <article
                    key={item.sale_item_id}
                    className="rounded-xl border border-slate-200 bg-amber-50/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-slate-500">
                          Sold {item.sold_quantity} | Refunded {item.refunded_quantity} |
                          Refundable {item.refundable_quantity}
                        </p>
                        <p className="text-xs text-slate-500">
                          Est. line unit LKR {toMoney(unitTotal)}
                        </p>
                      </div>
                      <label className="text-xs text-slate-600">
                        Refund Qty
                        <input
                          type="number"
                          min="0"
                          max={item.refundable_quantity}
                          step="0.001"
                          value={refundDraft.quantities[item.sale_item_id] ?? ''}
                          onChange={(event) =>
                            updateRefundQty(item.sale_item_id, event.target.value)
                          }
                          disabled={Number(item.refundable_quantity) <= 0}
                          className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm">
              <p>
                Selected items: <strong>{refundSelection.selectedCount}</strong>
              </p>
              <p>
                Estimated refund total: LKR{' '}
                <strong>{toMoney(refundSelection.selectedTotal)}</strong>
              </p>
              {refundSelection.hasInvalidInput ? (
                <p className="mt-1 text-xs text-rose-700">
                  One or more refund quantities are invalid.
                </p>
              ) : null}
              {!refundSelection.hasRefundableItems ? (
                <p className="mt-1 text-xs text-slate-600">
                  No refundable quantity remains for this sale.
                </p>
              ) : null}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold">Refund History</p>
              <div className="mt-2 space-y-1">
                {refundDraft.summary.refunds.map((refund) => (
                  <p key={refund.refund_id} className="text-xs text-slate-600">
                    {refund.refund_number} | LKR {toMoney(refund.grand_total)} |{' '}
                    {new Date(refund.created_at).toLocaleString('en-LK')}
                  </p>
                ))}
                {refundDraft.summary.refunds.length === 0 ? (
                  <p className="text-xs text-slate-500">No previous refunds.</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submitRefund()}
                disabled={
                  isRefundSubmitting ||
                  refundSelection.hasInvalidInput ||
                  !refundSelection.hasRefundableItems
                }
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {isRefundSubmitting ? 'Processing...' : 'Submit Refund'}
              </button>
              <button
                type="button"
                onClick={() => setRefundDraft(null)}
                disabled={isRefundSubmitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {canManageInventory ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">MVP Reports</h2>
              <p className="text-xs text-slate-500">
                Daily sales, transactions, payment breakdown, top items, and low
                stock.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">
                From
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                  className="mt-1 block rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                To
                <input
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                  className="mt-1 block rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void loadReports()}
                disabled={isReportsLoading}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {isReportsLoading ? 'Loading...' : 'Refresh Reports'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <article className="rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Daily Sales</h3>
              <div className="mt-2 space-y-1 text-xs">
                {(reports.daily?.items ?? []).map((item) => (
                  <p key={item.date} className="flex justify-between gap-2">
                    <span>
                      {item.date} | sales {item.sales_count} | refunds {item.refund_count}
                    </span>
                    <span className="font-medium">LKR {toMoney(item.net_sales)}</span>
                  </p>
                ))}
                {!reports.daily?.items?.length ? (
                  <p className="text-slate-500">No daily data.</p>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Net total: LKR {toMoney(reports.daily?.net_sales_total ?? 0)}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Payment Breakdown</h3>
              <div className="mt-2 space-y-1 text-xs">
                {(reports.paymentBreakdown?.items ?? []).map((item) => (
                  <p key={item.method} className="flex justify-between gap-2">
                    <span>
                      {paymentMethodLabel(item.method)} (reversed LKR{' '}
                      {toMoney(item.reversed_amount)})
                    </span>
                    <span className="font-medium">LKR {toMoney(item.net_amount)}</span>
                  </p>
                ))}
                {!reports.paymentBreakdown?.items?.length ? (
                  <p className="text-slate-500">No payment data.</p>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Net total: LKR {toMoney(reports.paymentBreakdown?.net_total ?? 0)}
              </p>
            </article>

            <article className="rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Top Items</h3>
              <div className="mt-2 space-y-1 text-xs">
                {(reports.topItems?.items ?? []).map((item) => (
                  <p key={item.product_id} className="flex justify-between gap-2">
                    <span>
                      {item.product_name} | qty {item.net_quantity}
                    </span>
                    <span className="font-medium">LKR {toMoney(item.net_sales)}</span>
                  </p>
                ))}
                {!reports.topItems?.items?.length ? (
                  <p className="text-slate-500">No top item data.</p>
                ) : null}
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 p-3">
              <h3 className="text-sm font-semibold">Low Stock</h3>
              <div className="mt-2 space-y-1 text-xs">
                {(reports.lowStock?.items ?? []).map((item) => (
                  <p key={item.product_id} className="flex justify-between gap-2">
                    <span>
                      {item.product_name} | on hand {item.quantity_on_hand}
                    </span>
                    <span className="font-medium">deficit {item.deficit}</span>
                  </p>
                ))}
                {!reports.lowStock?.items?.length ? (
                  <p className="text-slate-500">No low-stock items.</p>
                ) : null}
              </div>
            </article>
          </div>

          <article className="mt-4 rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold">Transactions</h3>
            <div className="mt-2 space-y-1 text-xs">
              {(reports.transactions?.items ?? []).map((item) => (
                <p key={item.sale_id}>
                  {item.sale_number} | {item.status} | {new Date(item.timestamp).toLocaleString('en-LK')} | LKR{' '}
                  {toMoney(item.net_collected)} ({item.payment_breakdown
                    .map(
                      (payment) =>
                        `${paymentMethodLabel(payment.method)} ${toMoney(payment.net_amount)}`,
                    )
                    .join(', ')})
                </p>
              ))}
              {!reports.transactions?.items?.length ? (
                <p className="text-slate-500">No transactions for this range.</p>
              ) : null}
            </div>
          </article>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default App
