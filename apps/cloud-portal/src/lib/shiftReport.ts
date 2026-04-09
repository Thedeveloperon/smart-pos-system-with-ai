export type ShiftReportPaymentRow = {
  method: string;
  total: number;
};

export type ShiftReportTransactionRow = {
  sale_id: string;
  sale_number: string;
  status: string;
  timestamp: string;
  cashier_username?: string | null;
  cashier_full_name?: string | null;
  items_count: number;
  grand_total: number;
  paid_total: number;
  custom_payout_used: boolean;
  cash_short_amount?: number;
  payment_breakdown: {
    method: string;
    net_amount: number;
  }[];
};

const toValidDate = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export type ShiftReportData = {
  title: string;
  shiftNumber: number;
  cashierName: string;
  generatedAt: Date;
  reportDateLabel: string;
  openedAt: Date;
  closedAt?: Date | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number;
  cashInDrawer: number;
  totalSales: number;
  grossSales: number;
  cashSales: number;
  cashShortSalesCount: number;
  cashShortTotal: number;
  balanceStatus: string;
  balanceIsHealthy: boolean;
  paymentTotals: ShiftReportPaymentRow[];
  transactions: ShiftReportTransactionRow[];
};

const money = (value: number) => `Rs. ${value.toLocaleString()}`;
export const signedMoney = (value: number) => {
  if (value === 0) {
    return money(0);
  }

  return `+${money(Math.abs(value))}`;
};

export const getDisplayCashShortAmount = (sale: {
  custom_payout_used: boolean;
  cash_short_amount?: number;
}) => {
  if (!sale.custom_payout_used) {
    return 0;
  }

  return sale.cash_short_amount ?? 0;
};

export const filterShiftTransactions = <T extends { timestamp: string }>(
  transactions: T[],
  openedAt?: string | Date | null,
  closedAt?: string | Date | null,
) => {
  const start = toValidDate(openedAt);
  const end = toValidDate(closedAt);

  return transactions.filter((transaction) => {
    const timestamp = new Date(transaction.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      return false;
    }

    if (start && timestamp < start) {
      return false;
    }

    if (end && timestamp > end) {
      return false;
    }

    return true;
  });
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const buildReportHtml = (data: ShiftReportData) => {
  const shiftStartLabel = data.openedAt.toLocaleString();
  const shiftEndLabel = data.closedAt ? data.closedAt.toLocaleString() : "Open";
  const shiftCashierName = data.cashierName.trim() || "Unknown";
  const transactionsRows = data.transactions
    .map((sale, index) => {
      const cashier = sale.cashier_full_name || sale.cashier_username || "Unknown";
      const shortAmount = sale.custom_payout_used ? signedMoney(getDisplayCashShortAmount(sale)) : "-";

      return `
        <tr class="${sale.custom_payout_used ? "cash-short" : ""}">
          <td class="center">${escapeHtml(index + 1)}</td>
          <td>${escapeHtml(sale.sale_number)}</td>
          <td>${escapeHtml(cashier)}</td>
          <td>${escapeHtml(new Date(sale.timestamp).toLocaleString())}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td class="right">${escapeHtml(sale.items_count)}</td>
          <td class="right">${escapeHtml(money(sale.grand_total))}</td>
          <td class="right">${escapeHtml(money(sale.paid_total))}</td>
          <td class="right">${escapeHtml(shortAmount)}</td>
        </tr>
      `;
    })
    .join("");

  const paymentRows = data.paymentTotals
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.method)}</td>
          <td class="right">${escapeHtml(money(item.total))}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="header">
      <div>
        <h1 class="title">${escapeHtml(data.title)}</h1>
        <div class="muted">Generated ${escapeHtml(data.generatedAt.toLocaleString())}</div>
        <div class="muted">Shift start ${escapeHtml(shiftStartLabel)} · Shift end ${escapeHtml(shiftEndLabel)}</div>
        <div class="muted">Cashier ${escapeHtml(shiftCashierName)}</div>
      </div>
      <div class="muted">Shift ${escapeHtml(data.shiftNumber)} · ${escapeHtml(data.reportDateLabel)}</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Opening Cash</div><div class="value">${escapeHtml(money(data.openingCash))}</div></div>
      <div class="card"><div class="label">Closing Cash</div><div class="value">${escapeHtml(data.closingCash === null ? "Not closed yet" : money(data.closingCash))}</div></div>
      <div class="card"><div class="label">Expected Cash</div><div class="value">${escapeHtml(money(data.expectedCash))}</div></div>
      <div class="card"><div class="label">Cash in Drawer</div><div class="value">${escapeHtml(money(data.cashInDrawer))}</div></div>
      <div class="card"><div class="label">Total Sales</div><div class="value">${escapeHtml(data.totalSales)}</div></div>
      <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(data.grossSales))}</div></div>
      <div class="card"><div class="label">Cash Sales</div><div class="value">${escapeHtml(money(data.cashSales))}</div></div>
      <div class="card"><div class="label">Cash Short Sales</div><div class="value">${escapeHtml(data.cashShortSalesCount)}</div></div>
      <div class="card"><div class="label">Cash Short Total</div><div class="value">${escapeHtml(money(data.cashShortTotal))}</div></div>
    </div>

    <div class="balance ${data.balanceIsHealthy ? "healthy" : "unhealthy"}">
      <div class="line">
        <strong>Balance check</strong>
        <span class="muted">Opening ${escapeHtml(money(data.openingCash))} + Cash sales ${escapeHtml(money(data.cashSales))} = Expected ${escapeHtml(money(data.expectedCash))}</span>
      </div>
      <div class="status">${escapeHtml(data.balanceStatus)}</div>
    </div>

    <div class="section">
      <h2>Payment Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows || `<tr><td colspan="2" class="muted">No payments recorded yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Transactions</h2>
      <table>
        <thead>
          <tr>
            <th class="center">No.</th>
            <th>Bill</th>
            <th>Cashier</th>
            <th>Time</th>
            <th>Status</th>
            <th class="right">Items</th>
            <th class="right">Total</th>
            <th class="right">Paid</th>
            <th class="right">Cash Short</th>
          </tr>
        </thead>
        <tbody>
          ${transactionsRows || `<tr><td colspan="8" class="muted">No sales recorded yet.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
  `;
};

const buildReportDocument = (title: string, bodyHtml: string) => `
  <html>
    <head>
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; gap: 12px; }
        .title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
        .muted { color: #6b7280; font-size: 12px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
        .card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
        .card .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
        th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
        .section { margin-top: 18px; }
        .section h2 { font-size: 16px; margin: 0 0 8px; }
        .balance { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin-top: 16px; }
        .balance.healthy { border-color: #86efac; background: #f0fdf4; }
        .balance.unhealthy { border-color: #fca5a5; background: #fef2f2; }
        .balance .line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 12px; }
        .balance .status { margin-top: 6px; font-weight: 700; }
        .cash-short { color: #dc2626; font-weight: 700; }
        .center { text-align: center; }
        .right { text-align: right; }
        .footer { margin-top: 18px; font-size: 11px; color: #6b7280; }
      </style>
    </head>
    <body>
      ${bodyHtml}
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
  </html>
`;

export const buildShiftReportHtml = (data: ShiftReportData) => buildReportDocument(data.title, buildReportHtml(data));

export const openShiftReportPrintWindow = (data: ShiftReportData, windowRef?: Window | null) => {
  const printWindow = windowRef ?? window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    return null;
  }

  printWindow.document.write(buildShiftReportHtml(data));
  printWindow.document.close();
  return printWindow;
};
