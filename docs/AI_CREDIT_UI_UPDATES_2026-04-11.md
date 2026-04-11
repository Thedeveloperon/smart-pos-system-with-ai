# AI Credit UI Update Instructions

**Date:** 2026-04-11
**Scope:** Phase 1 UI changes for the AI credit flow improvement.
**Apps affected:** `apps/cloud-portal` (marketing website / account portal) · `apps/pos-app`

---

## Overview of Changes

| App | File | What changes |
|---|---|---|
| Cloud Portal | `src/app/[locale]/account/page.tsx` | Add Usage History tab to AI Credits section; add Pending Verifications card |
| POS App | `src/components/pos/HeaderBar.tsx` | Add low-credit badge state + Top Up link |
| POS App | `src/pages/Index.tsx` | Add wallet polling interval; add low-credit detection; pass new props to HeaderBar |
| POS App | `src/pages/AdminConsole.tsx` | Remove AI payment verification section |
| POS App | `.env.example` | Add `VITE_CLOUD_PORTAL_URL` entry |

---

## 1. Cloud Portal — `apps/cloud-portal/src/app/[locale]/account/page.tsx`

### 1-A. New State Variables

Add these state variables alongside the existing AI billing state block (near line 354):

```tsx
// Ledger (usage history)
const [aiCreditLedger, setAiCreditLedger] = useState<AiCreditLedgerItemResponse[]>([]);

// Pending manual payment verification
const [aiPendingManualPayments, setAiPendingManualPayments] = useState<AiPendingManualPaymentItemResponse[]>([]);
const [isVerifyingAiManualPayment, setIsVerifyingAiManualPayment] = useState(false);
const [verifyingAiPaymentId, setVerifyingAiPaymentId] = useState<string | null>(null);
const [aiVerifyReferenceInput, setAiVerifyReferenceInput] = useState("");
const [aiVerifyError, setAiVerifyError] = useState<string | null>(null);
const [aiVerifySuccess, setAiVerifySuccess] = useState<string | null>(null);
const [aiCreditActiveTab, setAiCreditActiveTab] = useState<"top-ups" | "usage">("top-ups");
```

### 1-B. New Response Types

Add these types alongside the existing AI response types (near line 92):

```tsx
type AiCreditLedgerItemResponse = {
  entry_type: string;        // "purchase" | "charge" | "refund" | "adjustment"
  delta_credits: number;     // positive = added, negative = deducted
  balance_after_credits: number;
  reference: string;
  description?: string | null;
  created_at_utc: string;
};

type AiCreditLedgerResponse = {
  items: AiCreditLedgerItemResponse[];
};

type AiPendingManualPaymentItemResponse = {
  payment_id: string;
  target_username: string;
  target_full_name?: string | null;
  shop_name?: string | null;
  payment_status: string;
  payment_method: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  submitted_reference?: string | null;
  created_at: string;
};

type AiPendingManualPaymentsResponse = {
  items: AiPendingManualPaymentItemResponse[];
};
```

### 1-C. Update `loadAiBillingData` to Fetch Ledger and Pending Payments

The existing `loadAiBillingData` function (around line 569) already fetches wallet, packs, and payment history in a `Promise.all`. Extend it to also fetch the ledger and (for owner/manager only) the pending manual payments:

**Find this block inside `loadAiBillingData`:**
```tsx
const [walletResponse, packsResponse, paymentsResponse] = await Promise.all([
  fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/credit-packs", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/payments?take=10", { method: "GET", cache: "no-store" }),
]);
```

**Replace with:**
```tsx
const fetchPending = canViewLicensePortal
  ? fetch("/api/account/ai/payments/pending-manual?take=40", { method: "GET", cache: "no-store" })
  : Promise.resolve(null);

const [walletResponse, packsResponse, paymentsResponse, ledgerResponse, pendingResponse] =
  await Promise.all([
    fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }),
    fetch("/api/account/ai/credit-packs", { method: "GET", cache: "no-store" }),
    fetch("/api/account/ai/payments?take=10", { method: "GET", cache: "no-store" }),
    fetch("/api/account/ai/ledger?take=50", { method: "GET", cache: "no-store" }),
    fetchPending,
  ]);
```

Then add parsing and state updates after the existing ones. Find where `setAiPaymentHistory(nextPayments)` is called and add below it:

```tsx
// Ledger
if (ledgerResponse && ledgerResponse.ok) {
  const ledgerPayload = await parseApiPayload(ledgerResponse);
  const ledger = ledgerPayload as AiCreditLedgerResponse | null;
  setAiCreditLedger(Array.isArray(ledger?.items) ? ledger.items : []);
} else {
  setAiCreditLedger([]);
}

// Pending manual payments (owner/manager only)
if (pendingResponse && pendingResponse.ok) {
  const pendingPayload = await parseApiPayload(pendingResponse);
  const pending = pendingPayload as AiPendingManualPaymentsResponse | null;
  setAiPendingManualPayments(Array.isArray(pending?.items) ? pending.items : []);
} else {
  setAiPendingManualPayments([]);
}
```

Also update the 401 and 403 handler blocks to reset the new state:
```tsx
// inside the 401 block, add:
setAiCreditLedger([]);
setAiPendingManualPayments([]);

// inside the 403 block, add:
setAiCreditLedger([]);
setAiPendingManualPayments([]);
```

### 1-D. New `handleVerifyAiManualPayment` Callback

Add this callback after `resetAiManualFallbackState`:

```tsx
const handleVerifyAiManualPayment = useCallback(
  async (payload: { paymentId?: string; externalReference?: string }) => {
    const paymentId = payload.paymentId?.trim();
    const externalReference = payload.externalReference?.trim();
    if (!paymentId && !externalReference) {
      setAiVerifyError("Payment ID or external reference is required.");
      return;
    }

    setIsVerifyingAiManualPayment(true);
    setVerifyingAiPaymentId(paymentId ?? "__by_reference__");
    setAiVerifyError(null);
    setAiVerifySuccess(null);

    try {
      const response = await fetch("/api/account/ai/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId, external_reference: externalReference }),
        cache: "no-store",
      });
      const responsePayload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(responsePayload));
      }
      setAiVerifySuccess("Payment verified. Credits have been added.");
      setAiVerifyReferenceInput("");
      void loadAiBillingData({ trackEvent: false });
    } catch (error) {
      setAiVerifyError(error instanceof Error ? error.message : "Failed to verify payment.");
    } finally {
      setIsVerifyingAiManualPayment(false);
      setVerifyingAiPaymentId(null);
    }
  },
  [loadAiBillingData],
);
```

### 1-E. Replace "Recent Top-Ups" Card with Tabbed History

**Find this block** in the JSX (the `Recent Top-Ups` card, near the bottom of the AI Credits section):
```tsx
<div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
  <p className="portal-kicker">Recent Top-Ups</p>
  {aiPaymentHistory.length === 0 ? (
    <p className="text-sm text-muted-foreground">No AI credit payments found yet.</p>
  ) : (
    <div className="space-y-2">
      {aiPaymentHistory.slice(0, 8).map((item) => (
        // ... payment history rows ...
      ))}
    </div>
  )}
</div>
```

**Replace it with a two-tab layout:**
```tsx
<div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
  {/* Tab toggles */}
  <div className="flex gap-1 rounded-lg border border-border/50 bg-background p-0.5 w-fit">
    <button
      type="button"
      onClick={() => setAiCreditActiveTab("top-ups")}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        aiCreditActiveTab === "top-ups"
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Recent Top-Ups
    </button>
    <button
      type="button"
      onClick={() => setAiCreditActiveTab("usage")}
      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
        aiCreditActiveTab === "usage"
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Usage History
    </button>
  </div>

  {/* Top-Ups tab */}
  {aiCreditActiveTab === "top-ups" && (
    <>
      {aiPaymentHistory.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI credit payments found yet.</p>
      ) : (
        <div className="space-y-2">
          {aiPaymentHistory.slice(0, 8).map((item) => (
            <div
              key={item.payment_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">
                  {formatCredits(item.credits)} credits · {formatAmount(item.amount, item.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {toSentence(item.payment_status)} · {toSentence(item.payment_method)} · {formatDate(item.created_at)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {item.external_reference || item.payment_id}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  )}

  {/* Usage History tab */}
  {aiCreditActiveTab === "usage" && (
    <>
      {aiCreditLedger.length === 0 ? (
        <p className="text-sm text-muted-foreground">No credit usage recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {aiCreditLedger.map((item, index) => {
            const isPositive = item.delta_credits > 0;
            const entryLabel = item.entry_type.replace(/_/g, " ");
            return (
              <div
                key={`${item.reference}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {entryLabel}
                    <span
                      className={`ml-2 font-mono text-xs font-semibold ${
                        isPositive ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {item.delta_credits.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance after: {item.balance_after_credits.toLocaleString(undefined, { maximumFractionDigits: 2 })} · {formatDate(item.created_at_utc)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                  {item.reference}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  )}
</div>
```

### 1-F. New "Pending Verifications" Card

Add this block **after** the closing `</>` of the `!aiTopUpUnavailable` section and **before** the closing `</section>` of the AI Credits section. It is only shown when `canViewLicensePortal` is true and the user is logged in:

```tsx
{canViewLicensePortal && authSession && (
  <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
    <div>
      <p className="portal-kicker">Pending Manual Payment Verifications</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Verify cash or bank-deposit AI credit payments submitted by users.
      </p>
    </div>

    {/* Verify by reference input */}
    <div className="flex flex-wrap gap-2 items-end">
      <div className="space-y-1 flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Verify by External Reference</label>
        <input
          className="field-shell"
          placeholder="e.g. BANK-REF-001"
          value={aiVerifyReferenceInput}
          onChange={(e) => setAiVerifyReferenceInput(e.target.value)}
          disabled={isVerifyingAiManualPayment}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isVerifyingAiManualPayment || !aiVerifyReferenceInput.trim()}
        onClick={() =>
          void handleVerifyAiManualPayment({ externalReference: aiVerifyReferenceInput })
        }
      >
        {isVerifyingAiManualPayment && verifyingAiPaymentId === "__by_reference__"
          ? "Verifying..."
          : "Verify by Reference"}
      </Button>
    </div>

    {aiVerifyError && <p className="text-xs text-destructive">{aiVerifyError}</p>}
    {aiVerifySuccess && <p className="text-xs text-emerald-600">{aiVerifySuccess}</p>}

    {/* Pending items list */}
    {aiPendingManualPayments.length === 0 ? (
      <p className="text-sm text-muted-foreground">No pending manual AI payments.</p>
    ) : (
      <div className="space-y-2">
        {aiPendingManualPayments.map((item) => (
          <div
            key={item.payment_id}
            className="rounded-md border border-border/70 bg-background p-3 space-y-1"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold capitalize">
                {item.payment_status.replace(/_/g, " ")}
              </span>
              <span className="rounded border border-border/70 bg-muted px-1.5 py-0.5 text-muted-foreground capitalize">
                {item.payment_method.replace(/_/g, " ")}
              </span>
              <span className="text-muted-foreground">{formatDate(item.created_at)}</span>
              <span className="ml-auto font-medium">
                {formatCredits(item.credits)} credits · {formatAmount(item.amount, item.currency)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              User: {item.target_full_name || item.target_username}
              {item.target_full_name ? ` (${item.target_username})` : ""}
              {item.shop_name ? ` · Shop: ${item.shop_name}` : ""}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              Submitted Ref: {item.submitted_reference || "—"} · External Ref: {item.external_reference}
            </p>
            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isVerifyingAiManualPayment && verifyingAiPaymentId === item.payment_id}
                onClick={() =>
                  void handleVerifyAiManualPayment({
                    paymentId: item.payment_id,
                    externalReference: item.external_reference,
                  })
                }
              >
                {isVerifyingAiManualPayment && verifyingAiPaymentId === item.payment_id
                  ? "Verifying..."
                  : "Verify"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

---

## 2. POS App — `apps/pos-app/src/components/pos/HeaderBar.tsx`

### 2-A. Extend `HeaderBarProps`

Find the `interface HeaderBarProps` block (line 30) and add two optional props:

```tsx
interface HeaderBarProps {
  // ... existing props ...
  aiCredits?: number | null;
  isAiCreditLow?: boolean;      // ← add this
  cloudPortalUrl?: string;       // ← add this
  // ... rest of existing props ...
}
```

### 2-B. Destructure New Props

Find the destructure block (around line 78) and add the new props with defaults:

```tsx
  aiCredits = null,
  isAiCreditLow = false,     // ← add this
  cloudPortalUrl = "",        // ← add this
```

### 2-C. Update Desktop AI Insights Badge

**Find the existing desktop badge** (around line 172):
```tsx
{aiCredits !== null && (
  <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-emerald-500 text-white">
    {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
```

**Replace with:**
```tsx
{aiCredits !== null && (
  <Badge
    className={`absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] text-white ${
      isAiCreditLow ? "bg-amber-500" : "bg-emerald-500"
    }`}
    title={isAiCreditLow ? "AI credits are low" : undefined}
  >
    {isAiCreditLow ? "!" : aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
{isAiCreditLow && cloudPortalUrl && (
  <a
    href={`${cloudPortalUrl}/account`}
    target="_blank"
    rel="noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-300 hover:bg-amber-200 hidden md:block"
  >
    Top Up
  </a>
)}
```

### 2-D. Update Mobile Dropdown Badge

**Find the existing mobile badge** (around line 362):
```tsx
{aiCredits !== null && (
  <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">
    {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
```

**Replace with:**
```tsx
{aiCredits !== null && (
  <Badge
    className={`ml-auto h-5 min-w-5 px-1 text-[10px] text-white ${
      isAiCreditLow ? "bg-amber-500" : "bg-emerald-500"
    }`}
  >
    {isAiCreditLow ? "Low" : aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
{isAiCreditLow && cloudPortalUrl && (
  <a
    href={`${cloudPortalUrl}/account`}
    target="_blank"
    rel="noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="ml-2 text-xs text-amber-600 underline hover:text-amber-800"
  >
    Top Up
  </a>
)}
```

---

## 3. POS App — `apps/pos-app/src/pages/Index.tsx`

### 3-A. Add Constants Near the Top of the File

Add these near the other constants at the top of the component (or just before the `Index` function):

```tsx
const AI_LOW_CREDIT_THRESHOLD = 10;
const CLOUD_PORTAL_URL = (import.meta.env.VITE_CLOUD_PORTAL_URL || "").replace(/\/$/, "");
```

### 3-B. Add Background Wallet Polling

The existing `loadAiWallet` effect (around line 279) fires once on mount:
```tsx
useEffect(() => {
  void loadAiWallet();
}, [loadAiWallet]);
```

Add a **second effect** directly below it for polling:
```tsx
useEffect(() => {
  if (!isAdmin) return;
  const intervalId = window.setInterval(() => {
    void loadAiWallet();
  }, 60_000);
  return () => window.clearInterval(intervalId);
}, [isAdmin, loadAiWallet]);
```

### 3-C. Derive Low-Credit Flag

After the `aiCreditsBalance` state declaration (line 107), add this derived value:

```tsx
const isAiCreditLow =
  isAdmin && aiCreditsBalance !== null && aiCreditsBalance <= AI_LOW_CREDIT_THRESHOLD;
```

### 3-D. Pass New Props to `<HeaderBar>`

Find the `<HeaderBar ... />` JSX block (around line 931) and add the two new props:

```tsx
<HeaderBar
  // ... all existing props ...
  aiCredits={aiCreditsBalance}
  isAiCreditLow={isAiCreditLow}       {/* ← add */}
  cloudPortalUrl={CLOUD_PORTAL_URL}   {/* ← add */}
  // ... rest of existing props ...
/>
```

---

## 4. POS App — `apps/pos-app/src/pages/AdminConsole.tsx`

### 4-A. Remove Imports

**Find and remove** these three imports at the top of the file:

```tsx
import {
  fetchAiPendingManualPayments,
  verifyAiManualPayment,
  type AiPendingManualPaymentItem,
} from "@/lib/api";
```

### 4-B. Remove State Variables

**Find and remove** these five state declarations inside the `AdminConsole` component:

```tsx
const [verifyReference, setVerifyReference] = useState("");
const [isVerifyingAiPayment, setIsVerifyingAiPayment] = useState(false);
const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
const [pendingAiPayments, setPendingAiPayments] = useState<AiPendingManualPaymentItem[]>([]);
const [isLoadingPendingAiPayments, setIsLoadingPendingAiPayments] = useState(false);
```

### 4-C. Remove `loadPendingAiPayments` Callback and its `useEffect`

**Find and remove** the full `loadPendingAiPayments` callback:
```tsx
const loadPendingAiPayments = useCallback(async (quiet = false) => {
  // ...
}, []);
```

**Find and remove** the `useEffect` that calls it:
```tsx
useEffect(() => {
  if (isBillingAdmin) {
    return;
  }
  void loadPendingAiPayments(true);
}, [isBillingAdmin, loadPendingAiPayments]);
```

### 4-D. Remove `handleVerifyAiPayment` Callback

**Find and remove** the full callback:
```tsx
const handleVerifyAiPayment = useCallback(
  async (payload: { paymentId?: string; externalReference?: string }, clearReferenceInput = false) => {
    // ...
  },
  [loadPendingAiPayments],
);
```

### 4-E. Remove the AI Pending Payments JSX Section

**Find and remove** the entire JSX block that renders the pending AI payments list and the verify-by-reference input. It begins with something like:

```tsx
{!isBillingAdmin && (
  <section className="...">
    {/* AI Credit Purchasing Requests */}
    ...
  </section>
)}
```

Remove the entire section. The remaining `AdminConsole` should still render the `BillingAdminWorkspace` and `ManagerReportsDrawer` sections.

---

## 5. POS App — `apps/pos-app/.env.example`

Add one new line at the bottom:

```
# Cloud portal URL for AI credit top-up link (build-time). Leave empty to hide the link.
# Example: https://your-smartpos-portal.onrender.com
VITE_CLOUD_PORTAL_URL=
```

> **Note:** This is a Vite **build-time** variable baked into the frontend bundle.
> It is separate from `scripts/client/client.env` which configures the backend runtime.
> Set this in `.env.local` during development or in your Render/CI build environment.

---

## Visual Summary

### Cloud Portal Account Page — AI Credits Section (after changes)

```
┌─ AI Credits ────────────────────────────────────────────┐
│  Available Credits        Top-Up Pack                   │
│  ┌──────────────────┐    ┌────────────────────────────┐ │
│  │  1,250 credits   │    │ pack_500 · 500cr · $20.00  │ │
│  │  Updated: ...    │    │ Estimated after: 1,750 cr  │ │
│  └──────────────────┘    └────────────────────────────┘ │
│  [Pay with Card] [Need Bank Transfer?] [Refresh]        │
│                                                         │
│  ┌── Recent Top-Ups │ Usage History ───────────────────┐│
│  │ charge     −5.0    Balance: 1,245    insight-abc    ││
│  │ purchase  +500.0   Balance: 1,250    pay-xyz        ││
│  └──────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─ Pending Manual Payment Verifications (owner only) ─┐│
│  │  [Verify by Ref: _______________] [Verify by Ref]   ││
│  │  ┌─ pending_verification · bank_deposit · 12/04 ──┐ ││
│  │  │  User: John (john123) · Shop: ABC Store        │ ││
│  │  │  Submitted: BANK-001 · External: pay-abc123    │ ││
│  │  │                                    [Verify]    │ ││
│  │  └────────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### POS App Header Bar — AI Insights Button (after changes)

```
Normal (credits OK):          Low credits:
┌─────────────────────┐       ┌─────────────────────┐
│ ✦ AI Insights [245] │       │ ✦ AI Insights [!]   │
│              green  │       │              amber  │
└─────────────────────┘       │         [Top Up ↗]  │
                              └─────────────────────┘
```

Mobile dropdown badge:
```
Normal:  AI Insights          [245]  (green)
Low:     AI Insights          [Low]  (amber)  Top Up ↗
```

---

## Pre-flight Checklist

- [ ] `VITE_CLOUD_PORTAL_URL` is set in `.env.local` (dev) and Render build env (production)
- [ ] New proxy routes exist: `api/account/ai/ledger/route.ts`, `api/account/ai/payments/pending-manual/route.ts`, `api/account/ai/payments/verify/route.ts`
- [ ] Backend `GET /api/ai/ledger` endpoint is deployed before testing Usage History tab
- [ ] Backend `GET /api/ai/payments/pending-manual` and `POST /api/ai/payments/verify` endpoints exist (they already do — no backend change needed for these two)
- [ ] `AdminConsole.tsx` compiles without the removed imports and state
- [ ] `HeaderBar.tsx` renders without TypeScript errors after prop additions
