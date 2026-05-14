# AI Credit UX — Remaining Gaps (branch: `feature/ai-credit-relay-ledger-ux`)

**Date:** 2026-04-11  
**Branch:** `feature/ai-credit-relay-ledger-ux`  
**Author:** audit by Claude Code

Two items were not implemented in the branch commit. All other planned changes
(backend relay service, ledger endpoint, cloud portal proxy routes, billing
activity tabs, POS admin console cleanup, env examples, render.yaml) are
already merged in this branch.

---

## Gap 1 — Cloud Portal: Pending Verifications card missing

### What's missing

The proxy routes were created:
- `apps/cloud-portal/src/app/api/account/ai/payments/pending-manual/route.ts`
- `apps/cloud-portal/src/app/api/account/ai/payments/verify/route.ts`

But the UI card that calls them was never added to the account page. Admins
(owner / manager) have no way to verify manual AI credit payments from the
cloud portal, which was the whole reason the verify route was built.

### File to edit

`apps/cloud-portal/src/app/[locale]/account/page.tsx`

### Step 1 — Add state variables

Find the block of existing state near line 373:

```tsx
const [aiCreditLedger, setAiCreditLedger] = useState<AiCreditLedgerItemResponse[]>([]);
const [aiBillingView, setAiBillingView] = useState<"payment_history" | "usage">("payment_history");
```

Add these five new lines immediately after:

```tsx
const [aiPendingManualPayments, setAiPendingManualPayments] = useState<AiPendingManualPaymentItem[]>([]);
const [isVerifyingAiManualPayment, setIsVerifyingAiManualPayment] = useState(false);
const [verifyingAiPaymentId, setVerifyingAiPaymentId] = useState<string | null>(null);
const [aiVerifyReferenceInput, setAiVerifyReferenceInput] = useState("");
const [aiVerifyError, setAiVerifyError] = useState<string | null>(null);
const [aiVerifySuccess, setAiVerifySuccess] = useState<string | null>(null);
```

### Step 2 — Add the TypeScript type

Add this type near the other `Ai*` types at the top of the file (around line 122,
next to `AiCreditLedgerResponse`):

```tsx
type AiPendingManualPaymentItem = {
  payment_id: string;
  pack_code: string;
  amount: number;
  currency: string;
  credits: number;
  payment_method: string;
  payment_status: string;
  submitted_reference?: string | null;
  external_reference?: string | null;
  created_at: string;
};

type AiPendingManualPaymentsResponse = {
  items: AiPendingManualPaymentItem[];
};
```

### Step 3 — Extend `loadAiBillingData` to fetch pending payments

Inside `loadAiBillingData`, find the `Promise.all` that currently fetches four
endpoints (wallet, credit-packs, payments, ledger). Extend it to five:

```tsx
// BEFORE
const [walletResponse, packsResponse, paymentsResponse, ledgerResponse] = await Promise.all([
  fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/credit-packs", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/payments?take=10", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/ledger?take=50", { method: "GET", cache: "no-store" }),
]);

// AFTER
const [walletResponse, packsResponse, paymentsResponse, ledgerResponse, pendingManualResponse] = await Promise.all([
  fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/credit-packs", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/payments?take=10", { method: "GET", cache: "no-store" }),
  fetch("/api/account/ai/ledger?take=50", { method: "GET", cache: "no-store" }),
  canViewLicensePortal
    ? fetch("/api/account/ai/payments/pending-manual?take=40", { method: "GET", cache: "no-store" })
    : Promise.resolve(null),
]);
```

Then extend the payload parsing block in the same way:

```tsx
// BEFORE
const [walletPayload, packsPayload, paymentsPayload, ledgerPayload] = await Promise.all([
  parseApiPayload(walletResponse),
  parseApiPayload(packsResponse),
  parseApiPayload(paymentsResponse),
  parseApiPayload(ledgerResponse),
]);

// AFTER
const [walletPayload, packsPayload, paymentsPayload, ledgerPayload, pendingManualPayload] = await Promise.all([
  parseApiPayload(walletResponse),
  parseApiPayload(packsResponse),
  parseApiPayload(paymentsResponse),
  parseApiPayload(ledgerResponse),
  pendingManualResponse ? parseApiPayload(pendingManualResponse) : Promise.resolve(null),
]);
```

Then after the existing `setAiCreditLedger(nextLedger)` line in the happy path, add:

```tsx
if (pendingManualPayload && pendingManualResponse?.ok) {
  const pendingManual = requireObjectPayload<AiPendingManualPaymentsResponse>(
    pendingManualPayload,
    "AI pending manual payments payload is empty.",
  );
  setAiPendingManualPayments(Array.isArray(pendingManual.items) ? pendingManual.items : []);
}
```

Also reset the state in the 401, 403, and catch blocks:

```tsx
setAiPendingManualPayments([]);
```

### Step 4 — Add `handleVerifyAiManualPayment` callback

Add this callback after `loadAiBillingData` (anywhere near the other `useCallback`
handlers in the file):

```tsx
const handleVerifyAiManualPayment = useCallback(
  async (paymentId: string) => {
    setIsVerifyingAiManualPayment(true);
    setVerifyingAiPaymentId(paymentId);
    setAiVerifyError(null);
    setAiVerifySuccess(null);
    try {
      const response = await fetch("/api/account/ai/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const payload = await parseApiPayload(response);
      if (!response.ok) {
        setAiVerifyError(parseErrorMessage(payload) || "Verification failed.");
        return;
      }
      const result = payload as { payment_status?: string };
      const status = result.payment_status ?? "updated";
      setAiVerifySuccess(
        status === "succeeded"
          ? "Payment verified — credits have been added."
          : `Payment status updated: ${status.replace(/_/g, " ")}.`,
      );
      // Refresh billing data to reflect the change
      await loadAiBillingData();
    } catch (error) {
      setAiVerifyError(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsVerifyingAiManualPayment(false);
      setVerifyingAiPaymentId(null);
    }
  },
  [loadAiBillingData],
);
```

Also add a `handleVerifyAiManualPaymentByReference` callback for the reference
search input:

```tsx
const handleVerifyAiManualPaymentByReference = useCallback(async () => {
  const ref = aiVerifyReferenceInput.trim();
  if (!ref) {
    setAiVerifyError("Enter a submitted or external reference.");
    return;
  }
  setAiVerifyError(null);
  setAiVerifySuccess(null);
  const normalizedRef = ref.toLowerCase();
  const match = aiPendingManualPayments.find((item) => {
    const ext = (item.external_reference || "").trim().toLowerCase();
    const sub = (item.submitted_reference || "").trim().toLowerCase();
    return ext === normalizedRef || sub === normalizedRef;
  });
  if (!match) {
    setAiVerifyError("No pending payment matched this reference.");
    return;
  }
  await handleVerifyAiManualPayment(match.payment_id);
  setAiVerifyReferenceInput("");
}, [aiPendingManualPayments, aiVerifyReferenceInput, handleVerifyAiManualPayment]);
```

### Step 5 — Add the Pending Verifications card in JSX

Find the closing of the "Billing Activity" card. It ends at approximately line 1824
with `</div>` then `</>` then `)}`. The card sits just before the `</section>` that
closes the AI Credits section. Insert the Pending Verifications card immediately
after that `</div>` (i.e. after the Billing Activity card, still inside the AI
credits section):

```tsx
{canViewLicensePortal && (
  <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
    <p className="portal-kicker">Pending Verifications</p>
    <p className="text-sm text-muted-foreground">
      Manual AI credit purchases (cash / bank deposit) awaiting confirmation.
    </p>

    {/* Reference search */}
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={aiVerifyReferenceInput}
        onChange={(e) => {
          setAiVerifyReferenceInput(e.target.value);
          setAiVerifyError(null);
          setAiVerifySuccess(null);
        }}
        placeholder="Submitted ref or aicpay_... external ref"
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm sm:flex-1"
      />
      <button
        type="button"
        disabled={isVerifyingAiManualPayment || !aiVerifyReferenceInput.trim()}
        onClick={() => void handleVerifyAiManualPaymentByReference()}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isVerifyingAiManualPayment ? "Verifying…" : "Verify by Reference"}
      </button>
    </div>

    {aiVerifyError && (
      <p className="text-sm text-destructive">{aiVerifyError}</p>
    )}
    {aiVerifySuccess && (
      <p className="text-sm text-emerald-700">{aiVerifySuccess}</p>
    )}

    {/* Per-item list */}
    {aiPendingManualPayments.length === 0 ? (
      <p className="text-sm text-muted-foreground">No pending manual payment requests.</p>
    ) : (
      <div className="space-y-2">
        {aiPendingManualPayments.map((item) => (
          <div
            key={item.payment_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">
                {formatCredits(item.credits)} credits · {formatAmount(item.amount, item.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                {toSentence(item.payment_method)} · {toSentence(item.payment_status)} · {formatDate(item.created_at)}
              </p>
              {item.submitted_reference && (
                <p className="text-xs font-mono text-muted-foreground">
                  Ref: {item.submitted_reference}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={isVerifyingAiManualPayment}
              onClick={() => void handleVerifyAiManualPayment(item.payment_id)}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {verifyingAiPaymentId === item.payment_id ? "Verifying…" : "Verify"}
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

**Where exactly to insert it:** after the `</div>` that closes the Billing Activity
card and before the `</>` / `)}` that closes the outer AI credits `<>` fragment.
The parent structure looks like this:

```
<>                                       ← outer AI credits fragment
  ... wallet card ...
  ... pack selector ...
  ... checkout buttons ...
  <div ...>                              ← Billing Activity card
    ...tabs...
  </div>                                 ← ← INSERT NEW CARD HERE
</>
```

---

## Gap 2 — POS App HeaderBar: AI credit badge does not turn amber when low

### What's missing

`Index.tsx` already computes `isAiCreditLow` (credits ≤ 10) and `aiTopUpUrl`
and shows an inline warning banner in the page body. However, the AI Insights
button badge in `HeaderBar.tsx` stays green regardless. The plan called for
the badge to turn amber and show a "!" indicator when credits are low, and for
a "Top Up" anchor to appear below the desktop badge.

### Files to edit

1. `apps/pos-app/src/components/pos/HeaderBar.tsx`
2. `apps/pos-app/src/pages/Index.tsx`

---

### HeaderBar.tsx changes

#### Step 1 — Extend `HeaderBarProps`

Current interface (line 30–69). Add two optional props after `aiCredits`:

```tsx
// existing
aiCredits?: number | null;
// ADD these two lines:
isAiCreditLow?: boolean;
cloudPortalUrl?: string;
```

#### Step 2 — Destructure the new props

Current destructuring (line 71–96). Add after `aiCredits = null,`:

```tsx
isAiCreditLow = false,
cloudPortalUrl,
```

#### Step 3 — Update the desktop badge (xl toolbar)

Find the current desktop AI Insights button badge (lines 172–176):

```tsx
{aiCredits !== null && (
  <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-emerald-500 text-white">
    {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
```

Replace with:

```tsx
{aiCredits !== null && (
  <Badge
    className={`absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] text-white ${
      isAiCreditLow ? "bg-amber-500" : "bg-emerald-500"
    }`}
  >
    {isAiCreditLow ? "!" : aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
```

Then add a "Top Up" anchor link directly below the `</Button>` closing tag for
the AI Insights button (still inside the `{onAiInsights && ...}` block):

```tsx
{isAiCreditLow && cloudPortalUrl && (
  <a
    href={`${cloudPortalUrl}/en/account`}
    target="_blank"
    rel="noreferrer"
    className="text-[10px] text-amber-400 hover:text-amber-300 leading-none"
    onClick={(e) => e.stopPropagation()}
  >
    Top Up
  </a>
)}
```

Note: the AI Insights button sits inside the `<div className="hidden xl:flex ...">` toolbar.
The anchor should be a sibling of the button, not a child, so it appears beside it.
Because the toolbar is a flex row, the anchor will sit to the right of the button.
If you want it stacked below, wrap the button + anchor in a `<div className="flex flex-col items-center gap-0.5">`.

#### Step 4 — Update the mobile dropdown badge

Find the mobile dropdown AI Insights badge (lines 362–366):

```tsx
{aiCredits !== null && (
  <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">
    {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
  </Badge>
)}
```

Replace with:

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
```

---

### Index.tsx changes

#### Pass the two new props to `<HeaderBar>`

Find the `<HeaderBar>` usage near line 950. Currently it has:

```tsx
aiCredits={aiCreditsBalance}
```

Add the two new props on the lines immediately after it:

```tsx
aiCredits={aiCreditsBalance}
isAiCreditLow={isAiCreditLow}
cloudPortalUrl={CLOUD_PORTAL_URL || undefined}
```

`isAiCreditLow` and `CLOUD_PORTAL_URL` are already defined earlier in `Index.tsx`
(added in the branch commit) — no new imports or constants are needed.

---

## Pre-flight checklist

- [ ] Gap 1: TypeScript type `AiPendingManualPaymentItem` added to `page.tsx`
- [ ] Gap 1: Six new state variables added to `page.tsx`
- [ ] Gap 1: `Promise.all` in `loadAiBillingData` extended to fetch pending-manual
- [ ] Gap 1: `handleVerifyAiManualPayment` callback added
- [ ] Gap 1: `handleVerifyAiManualPaymentByReference` callback added
- [ ] Gap 1: Pending Verifications card JSX added inside AI credits section
- [ ] Gap 2: `HeaderBarProps` has `isAiCreditLow` and `cloudPortalUrl`
- [ ] Gap 2: Desktop badge turns amber with "!" when low
- [ ] Gap 2: "Top Up" anchor rendered beside/below desktop badge when low
- [ ] Gap 2: Mobile dropdown badge turns amber with "Low" label
- [ ] Gap 2: `<HeaderBar>` in `Index.tsx` passes both new props

---

## No backend changes required

Both proxy routes already exist in the branch:
- `GET /api/account/ai/payments/pending-manual` → `apps/cloud-portal/src/app/api/account/ai/payments/pending-manual/route.ts`
- `POST /api/account/ai/payments/verify` → `apps/cloud-portal/src/app/api/account/ai/payments/verify/route.ts`

The backend endpoints (`GET /api/ai/payments/pending-manual` and
`POST /api/ai/payments/verify`) were pre-existing on `main` and need no changes.
