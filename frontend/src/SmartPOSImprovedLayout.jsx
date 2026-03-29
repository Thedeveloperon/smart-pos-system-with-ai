import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { posApi } from './lib/posApi'

const DEVICE_ID_STORAGE_KEY = 'smartpos-device-id'
const QUICK_CASH_AMOUNTS = [500, 1000, 2000, 5000]
const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'lankaqr', label: 'QR' },
]

function toMoney(value) {
  return Number(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function emptyLoginDraft() {
  return {
    username: 'manager',
    password: 'manager123',
  }
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

function normalizeProduct(rawProduct) {
  return {
    id: rawProduct.id,
    name: rawProduct.name ?? 'Unnamed Product',
    sku: rawProduct.sku ?? '-',
    price: Number(rawProduct.unitPrice ?? rawProduct.unit_price ?? 0),
    stock: Number(rawProduct.stockQuantity ?? rawProduct.stock_quantity ?? 0),
    category: rawProduct.categoryName ?? rawProduct.category_name ?? 'General',
  }
}

export default function SmartPOSImprovedLayout() {
  const [currentSession, setCurrentSession] = useState(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)
  const [loginDraft, setLoginDraft] = useState(emptyLoginDraft)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const [searchMode, setSearchMode] = useState('manual')
  const [searchTerm, setSearchTerm] = useState('')
  const [products, setProducts] = useState([])
  const [productQtyMap, setProductQtyMap] = useState({})
  const [isSearching, setIsSearching] = useState(false)

  const [cart, setCart] = useState([])
  const [customerMobile, setCustomerMobile] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentAmount, setPaymentAmount] = useState('')

  const [recentSales, setRecentSales] = useState([])
  const [isRecentSalesLoading, setIsRecentSalesLoading] = useState(false)

  const [heldBills, setHeldBills] = useState([])
  const [isHeldBillsLoading, setIsHeldBillsLoading] = useState(false)
  const [isHeldBillsOpen, setIsHeldBillsOpen] = useState(false)

  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const recentSalesRef = useRef(null)

  const normalizedProducts = useMemo(
    () => products.map((product) => normalizeProduct(product)),
    [products],
  )

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty * item.price, 0),
    [cart],
  )
  const discount = 0
  const total = Math.max(0, subtotal - discount)

  const cashReceived = Number(paymentAmount || 0)
  const change = Math.max(0, cashReceived - total)
  const due = Math.max(0, total - cashReceived)

  const canCompleteSale = cart.length > 0 && due === 0 && !isSubmitting
  const activeRole = currentSession?.role ?? 'cashier'
  const canAccessFullAdmin = activeRole === 'owner' || activeRole === 'manager'

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

  const loadRecentSales = useCallback(async () => {
    setIsRecentSalesLoading(true)
    try {
      const sales = await posApi.getSalesHistory(8)
      setRecentSales(sales)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load recent sales.',
      )
    } finally {
      setIsRecentSalesLoading(false)
    }
  }, [])

  const loadHeldBills = useCallback(async () => {
    setIsHeldBillsLoading(true)
    try {
      const bills = await posApi.getHeldSales()
      setHeldBills(bills)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load held bills.')
    } finally {
      setIsHeldBillsLoading(false)
    }
  }, [])

  const handleSearch = useCallback(async () => {
    setErrorMessage('')
    setIsSearching(true)

    try {
      const items = await posApi.searchProducts(searchTerm)
      setProducts(items)

      setProductQtyMap((current) => {
        const next = { ...current }
        for (const item of items) {
          if (!next[item.id]) {
            next[item.id] = 1
          }
        }
        return next
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Search failed.')
    } finally {
      setIsSearching(false)
    }
  }, [searchTerm])

  const loadInitialProducts = useCallback(async () => {
    setIsSearching(true)

    try {
      const items = await posApi.searchProducts('')
      setProducts(items)
      setProductQtyMap(() => {
        const next = {}
        for (const item of items) {
          next[item.id] = 1
        }
        return next
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load products.')
    } finally {
      setIsSearching(false)
    }
  }, [])

  const clearCheckoutDraft = useCallback(() => {
    setCart([])
    setPaymentMethod('cash')
    setPaymentAmount('')
  }, [])

  const addToCart = useCallback((product) => {
    const qty = Math.max(1, Number(productQtyMap[product.id] ?? 1))

    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + qty } : item,
        )
      }

      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          price: Number(product.price),
          qty,
        },
      ]
    })
  }, [productQtyMap])

  const updateCartQty = useCallback((productId, nextQty) => {
    setCart((current) =>
      current
        .map((item) => (item.id === productId ? { ...item, qty: Math.max(0, nextQty) } : item))
        .filter((item) => item.qty > 0),
    )
  }, [])

  const resumeHeldBill = useCallback(async (saleId) => {
    setErrorMessage('')
    setMessage('')

    try {
      const sale = await posApi.getHeldSale(saleId)
      setCart(
        sale.items.map((item) => ({
          id: item.product_id,
          name: item.product_name,
          sku: '-',
          category: 'General',
          price: Number(item.unit_price),
          qty: Number(item.quantity),
        })),
      )
      setPaymentMethod('cash')
      setPaymentAmount('')
      setIsHeldBillsOpen(false)
      setMessage(`Resumed held bill ${sale.sale_number}.`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to resume held bill.')
    }
  }, [])

  const handleHoldBill = useCallback(async () => {
    if (cart.length === 0) {
      setErrorMessage('Add items before holding a bill.')
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsSubmitting(true)

    try {
      const result = await posApi.holdSale({
        items: cart.map((item) => ({ product_id: item.id, quantity: item.qty })),
        discount_percent: 0,
        role: activeRole,
      })
      clearCheckoutDraft()
      setMessage(`Bill held as ${result.sale_number}.`)
      await Promise.all([loadHeldBills(), loadRecentSales()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to hold bill.')
    } finally {
      setIsSubmitting(false)
    }
  }, [activeRole, cart, clearCheckoutDraft, loadHeldBills, loadRecentSales])

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0) {
      setErrorMessage('Cart is empty.')
      return
    }

    if (due > 0) {
      setErrorMessage(`Add LKR ${toMoney(due)} to complete sale.`)
      return
    }

    setErrorMessage('')
    setMessage('')
    setIsSubmitting(true)

    try {
      const result = await posApi.completeSale({
        sale_id: null,
        items: cart.map((item) => ({ product_id: item.id, quantity: item.qty })),
        discount_percent: 0,
        role: activeRole,
        payments: [
          {
            method: paymentMethod,
            amount: cashReceived,
            reference_number: null,
          },
        ],
      })

      clearCheckoutDraft()
      setMessage(
        `Sale completed (${result.sale_number}). Total LKR ${toMoney(result.grand_total)}.`,
      )
      await Promise.all([loadRecentSales(), loadHeldBills()])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete sale.')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    activeRole,
    cart,
    cashReceived,
    clearCheckoutDraft,
    due,
    loadHeldBills,
    loadRecentSales,
    paymentMethod,
  ])

  const handleShareReceipt = useCallback(async (saleId) => {
    try {
      const result = await posApi.getWhatsappReceiptLink(saleId, customerMobile)
      window.open(result.url, '_blank', 'noopener,noreferrer')
      setMessage('WhatsApp receipt opened in a new tab.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to open WhatsApp receipt.',
      )
    }
  }, [customerMobile])

  const handlePrintReceipt = useCallback(async (saleId) => {
    try {
      await printThermalReceipt(saleId)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to print receipt.')
    }
  }, [])

  const handleQuickCashAmount = useCallback((amount) => {
    setPaymentAmount((current) => String(Number(current || 0) + amount))
  }, [])

  const handleSessionExpired = useCallback(() => {
    setCurrentSession(null)
    setErrorMessage('Session expired. Please sign in again.')
  }, [])

  const handleLogin = useCallback(async () => {
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
  }, [loginDraft.password, loginDraft.username])

  const handleLogout = useCallback(async () => {
    setErrorMessage('')
    setMessage('')
    setIsLoggingOut(true)

    try {
      await posApi.logout()
      setCurrentSession(null)
      clearCheckoutDraft()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Logout failed.')
    } finally {
      setIsLoggingOut(false)
    }
  }, [clearCheckoutDraft])

  useEffect(() => {
    void loadCurrentSession()
  }, [loadCurrentSession])

  useEffect(() => {
    window.addEventListener('smartpos:session-expired', handleSessionExpired)
    return () => {
      window.removeEventListener('smartpos:session-expired', handleSessionExpired)
    }
  }, [handleSessionExpired])

  useEffect(() => {
    if (!currentSession) {
      return
    }

    void Promise.all([loadInitialProducts(), loadRecentSales(), loadHeldBills()])
  }, [currentSession, loadHeldBills, loadInitialProducts, loadRecentSales])

  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <h1 className="text-xl font-semibold text-slate-900">SmartPOS Lanka</h1>
          <p className="mt-2 text-sm text-slate-600">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!currentSession) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-6 ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
            SmartPOS Lanka
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Sign In</h1>
          <p className="mt-1 text-sm text-slate-500">
            Use demo users: `owner`, `manager`, `cashier`.
          </p>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Username
            <input
              value={loginDraft.username}
              onChange={(event) =>
                setLoginDraft((current) => ({ ...current, username: event.target.value }))
              }
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-emerald-500"
            />
          </label>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              value={loginDraft.password}
              onChange={(event) =>
                setLoginDraft((current) => ({ ...current, password: event.target.value }))
              }
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-emerald-500"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isLoggingIn}
            className="mt-4 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isLoggingIn ? 'Signing In...' : 'Sign In'}
          </button>

          {errorMessage ? (
            <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5 lg:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
                SmartPOS Lanka
              </p>
              <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
                One-Screen Checkout
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Fast cashier workflow designed for low training and high-speed billing.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Signed in as {currentSession.full_name} ({currentSession.role})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsHeldBillsOpen((current) => !current)
                  if (!isHeldBillsOpen) {
                    void loadHeldBills()
                  }
                }}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:px-4"
              >
                Hold Bills ({heldBills.length})
              </button>
              <button
                type="button"
                onClick={() => recentSalesRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:px-4"
              >
                Recent Sales
              </button>
              {canAccessFullAdmin ? (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = '/admin'
                    }
                  }}
                  className="rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 md:px-4"
                >
                  Admin Tools
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 md:px-4"
              >
                {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            {message}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
            {errorMessage}
          </p>
        ) : null}

        {isHeldBillsOpen ? (
          <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Held Bills</h2>
              <button
                type="button"
                onClick={() => setIsHeldBillsOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {heldBills.map((bill) => (
                <article key={bill.sale_id} className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{bill.sale_number}</p>
                  <p className="text-xs text-slate-500">Items: {bill.item_count}</p>
                  <p className="text-xs text-slate-500">LKR {toMoney(bill.grand_total)}</p>
                  <button
                    type="button"
                    onClick={() => void resumeHeldBill(bill.sale_id)}
                    className="mt-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Resume
                  </button>
                </article>
              ))}
              {!heldBills.length ? (
                <p className="text-sm text-slate-500">
                  {isHeldBillsLoading ? 'Loading held bills...' : 'No held bills.'}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
          <section className="space-y-4 lg:col-span-7">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Product Search</h2>
                  <p className="text-sm text-slate-500">
                    Search by name, SKU, or barcode. Tap product to add instantly.
                  </p>
                </div>

                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 p-1 text-xs font-medium text-slate-600">
                  <button
                    type="button"
                    onClick={() => setSearchMode('manual')}
                    className={`rounded-xl px-3 py-2 ${
                      searchMode === 'manual' ? 'bg-white shadow-sm' : ''
                    }`}
                  >
                    Manual Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('barcode')}
                    className={`rounded-xl px-3 py-2 ${
                      searchMode === 'barcode' ? 'bg-white shadow-sm' : ''
                    }`}
                  >
                    Barcode Mode
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSearch()
                    }
                  }}
                  placeholder="Search product by name, SKU, or barcode"
                  className="h-12 flex-1 rounded-2xl border border-slate-200 px-4 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => void handleSearch()}
                  className="h-12 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div className="mt-4 max-h-[36rem] overflow-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  {normalizedProducts.map((product) => {
                    const qty = Number(productQtyMap[product.id] ?? 1)
                    return (
                      <div
                        key={product.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                              {product.category}
                            </span>
                            <h3 className="mt-2 text-base font-semibold text-slate-900">
                              {product.name}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500">SKU: {product.sku}</p>
                            <p className="mt-1 text-xs text-slate-500">Stock: {product.stock}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm ring-1 ring-slate-200">
                            <p className="text-xs text-slate-500">Price</p>
                            <p className="text-sm font-bold text-slate-900">
                              LKR {toMoney(product.price)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setProductQtyMap((current) => ({
                                  ...current,
                                  [product.id]: Math.max(1, Number(current[product.id] ?? 1) - 1),
                                }))
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                            >
                              -
                            </button>
                            <span className="text-sm font-semibold text-slate-700">{qty}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProductQtyMap((current) => ({
                                  ...current,
                                  [product.id]: Number(current[product.id] ?? 1) + 1,
                                }))
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => addToCart(product)}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {!normalizedProducts.length ? (
                  <p className="text-sm text-slate-500">No products found.</p>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:col-span-5">
            <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5 lg:sticky lg:top-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Checkout</h2>
                  <p className="text-sm text-slate-500">
                    Minimal, cashier-first payment flow.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {currentSession.role}
                </span>
              </div>

              <div className="mt-4 rounded-3xl bg-slate-900 p-5 text-white">
                <p className="text-sm text-slate-300">Grand Total</p>
                <p className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
                  LKR {toMoney(total)}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-slate-300">Subtotal</p>
                    <p className="mt-1 font-semibold text-white">LKR {toMoney(subtotal)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-slate-300">Discount</p>
                    <p className="mt-1 font-semibold text-white">- LKR {toMoney(discount)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-500/20 p-3 ring-1 ring-emerald-400/30">
                    <p className="text-emerald-200">Items</p>
                    <p className="mt-1 font-semibold text-white">{cart.length}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="launch101-customer-mobile"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Customer mobile
                  </label>
                  <input
                    id="launch101-customer-mobile"
                    value={customerMobile}
                    onChange={(event) => setCustomerMobile(event.target.value)}
                    placeholder="07XXXXXXXX"
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Quick payment
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setPaymentMethod(method.value)}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                          paymentMethod === method.value
                            ? 'bg-emerald-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="launch101-cash-received"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Cash received
                    </label>
                    <input
                      id="launch101-cash-received"
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-800"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="launch101-change-amount"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Change
                    </label>
                    <input
                      id="launch101-change-amount"
                      value={`LKR ${toMoney(change)}`}
                      readOnly
                      className="h-12 w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Quick cash buttons
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {QUICK_CASH_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => handleQuickCashAmount(amount)}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>

                {due > 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Add LKR {toMoney(due)} more to complete sale.
                  </p>
                ) : null}
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">Cart</h3>
                </div>
                <div className="max-h-64 space-y-3 overflow-auto p-4 md:max-h-72">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            Qty {item.qty} × LKR {toMoney(item.price)}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-slate-900">
                          LKR {toMoney(item.qty * item.price)}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, item.qty - 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                        >
                          -
                        </button>
                        <span className="text-sm font-semibold text-slate-700">{item.qty}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, item.qty + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, 0)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}

                  {!cart.length ? (
                    <p className="text-sm text-slate-500">Cart is empty.</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => void handleHoldBill()}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
                >
                  Hold
                </button>
                <button
                  type="button"
                  onClick={clearCheckoutDraft}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCompleteSale()}
                  disabled={!canCompleteSale}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  Complete Sale
                </button>
              </div>
            </div>

          </aside>

          <section
            ref={recentSalesRef}
            className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5 lg:col-span-12"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent Sales</h2>
                <p className="text-sm text-slate-500">
                  Keep only the most relevant recent transactions visible.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadRecentSales()}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                {isRecentSalesLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentSales.map((sale) => (
                <div key={sale.sale_id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{sale.sale_number}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(sale.completed_at ?? sale.timestamp ?? Date.now()).toLocaleTimeString(
                          'en-LK',
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                        {' • '}
                        {sale.payment_breakdown?.[0]?.method ?? 'Mixed'}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      LKR {toMoney(sale.grand_total)}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePrintReceipt(sale.sale_id)}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Reprint
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareReceipt(sale.sale_id)}
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                    >
                      WhatsApp
                    </button>
                  </div>
                </div>
              ))}

              {!recentSales.length ? (
                <p className="text-sm text-slate-500">No recent sales yet.</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
