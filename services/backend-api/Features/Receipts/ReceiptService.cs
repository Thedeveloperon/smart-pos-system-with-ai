using System.Globalization;
using System.Net;
using System.Text;
using SmartPos.Backend.Features.Checkout;
using SmartPos.Backend.Features.Settings;

namespace SmartPos.Backend.Features.Receipts;

public sealed class ReceiptService(CheckoutService checkoutService)
{
    public async Task<SaleResponse?> GetReceiptAsync(Guid saleId, CancellationToken cancellationToken)
    {
        return await checkoutService.GetSaleAsync(saleId, cancellationToken);
    }

    public static string BuildThermalText(SaleResponse sale, ShopProfileResponse? shopProfile = null)
    {
        const int width = 32;
        var separator = new string('-', width);
        var sb = new StringBuilder();
        var shopName = GetShopName(shopProfile);

        AppendCentered(sb, shopName, width);
        AppendCentered(sb, "Receipt", width);
        if (!string.IsNullOrWhiteSpace(shopProfile?.AddressLine1))
        {
            AppendCentered(sb, shopProfile.AddressLine1!, width);
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.AddressLine2))
        {
            AppendCentered(sb, shopProfile.AddressLine2!, width);
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.Phone))
        {
            AppendCentered(sb, shopProfile.Phone!, width);
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.Email))
        {
            AppendCentered(sb, shopProfile.Email!, width);
        }
        sb.AppendLine(separator);
        sb.AppendLine($"Sale: {sale.SaleNumber}");
        sb.AppendLine($"Date: {ToLocalDateTime(sale).ToString("dd-MMM-yyyy HH:mm", CultureInfo.InvariantCulture)}");
        sb.AppendLine($"Status: {sale.Status.ToUpperInvariant()}");
        sb.AppendLine(separator);

        foreach (var item in sale.Items)
        {
            sb.AppendLine(TrimToWidth(item.ProductName, width));
            var qtyPrice = $"{item.Quantity:0.###} x {item.UnitPrice:0.00}";
            var discount = item.UnitPrice * item.Quantity - item.LineTotal;
            sb.AppendLine(AlignLeftRight(qtyPrice, $"LKR {item.LineTotal:0.00}", width));
            if (discount > 0m)
            {
                sb.AppendLine(AlignLeftRight("Discount", $"-LKR {discount:0.00}", width));
            }
        }

        sb.AppendLine(separator);
        sb.AppendLine(AlignLeftRight("Subtotal", $"LKR {sale.Subtotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Discount", $"-LKR {sale.DiscountTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Total", $"LKR {sale.GrandTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Paid", $"LKR {sale.PaidTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Balance", $"LKR {sale.GrandTotal - sale.PaidTotal:0.00}", width));
        sb.AppendLine(separator);

        if (sale.PaymentBreakdown.Count > 0)
        {
            sb.AppendLine("Payments:");
            foreach (var payment in sale.PaymentBreakdown)
            {
                var method = payment.Method.ToUpperInvariant();
                sb.AppendLine(AlignLeftRight(method, $"LKR {payment.NetAmount:0.00}", width));
                if (payment.ReversedAmount > 0m)
                {
                    sb.AppendLine(AlignLeftRight("  reversed", $"LKR {payment.ReversedAmount:0.00}", width));
                }
            }
            sb.AppendLine(separator);
        }

        if (!string.IsNullOrWhiteSpace(shopProfile?.ReceiptFooter))
        {
            AppendCentered(sb, shopProfile.ReceiptFooter!, width);
        }
        else
        {
            AppendCentered(sb, "Thank you for shopping with us.", width);
        }

        return sb.ToString();
    }

    public static string BuildHtmlReceipt(SaleResponse sale, ShopProfileResponse? shopProfile = null)
    {
        var shopName = GetShopName(shopProfile);
        var footer = string.IsNullOrWhiteSpace(shopProfile?.ReceiptFooter)
            ? "Thank you for shopping with us."
            : shopProfile.ReceiptFooter!;
        var completedAt = ToLocalDateTime(sale).ToString("dd-MMM-yyyy hh:mm tt", CultureInfo.InvariantCulture);
        var logoUrl = string.IsNullOrWhiteSpace(shopProfile?.LogoUrl) ? null : shopProfile!.LogoUrl!.Trim();

        var sb = new StringBuilder();
        sb.AppendLine("<!doctype html>");
        sb.AppendLine("<html lang=\"en\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"utf-8\" />");
        sb.AppendLine("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />");
        sb.AppendLine($"<title>{Html(shopName)} - {Html(sale.SaleNumber)}</title>");
        sb.AppendLine("""
<style>
  :root {
    color-scheme: light;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    background: #f5f5f5;
    font-family: Arial, Helvetica, sans-serif;
    color: #111827;
  }
  .receipt {
    width: 80mm;
    min-height: 100vh;
    margin: 0 auto;
    padding: 16px 12px 18px;
    background: #fff;
  }
  .header {
    text-align: center;
  }
  .logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    display: block;
    margin: 0 auto 8px;
  }
  .shop-name {
    font-size: 20px;
    font-weight: 700;
    margin: 4px 0 2px;
  }
  .muted {
    color: #4b5563;
    font-size: 12px;
    line-height: 1.4;
  }
  .rule {
    border-top: 1px solid #d1d5db;
    margin: 10px 0;
  }
  .meta, .summary-row, .payment-row, .item-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .meta {
    font-size: 12px;
    line-height: 1.5;
    margin: 2px 0;
  }
  .meta span:last-child {
    text-align: right;
  }
  .items {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .items th, .items td {
    padding: 6px 0;
    vertical-align: top;
  }
  .items thead th {
    border-bottom: 1px solid #9ca3af;
    border-top: 1px solid #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .items tbody tr {
    border-bottom: 1px solid #e5e7eb;
  }
  .items .name {
    width: 42%;
    padding-right: 6px;
  }
  .items .num {
    text-align: right;
    white-space: nowrap;
  }
  .totals {
    margin-top: 12px;
    font-size: 13px;
  }
  .totals .summary-row {
    padding: 3px 0;
  }
  .totals .summary-row.total {
    font-size: 16px;
    font-weight: 700;
    border-top: 1px solid #d1d5db;
    margin-top: 4px;
    padding-top: 8px;
  }
  .payments {
    margin-top: 10px;
    font-size: 12px;
  }
  .payments h3 {
    margin: 0 0 4px;
    font-size: 13px;
    text-transform: uppercase;
  }
  .footer {
    margin-top: 14px;
    text-align: center;
    font-size: 12px;
    color: #4b5563;
  }
  .balance-negative {
    font-weight: 700;
  }
  @media print {
    body {
      background: #fff;
    }
    .receipt {
      width: 80mm;
      min-height: auto;
      padding: 0 0 6mm;
    }
  }
</style>
""");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");
        sb.AppendLine("<div class=\"receipt\">");
        sb.AppendLine("<div class=\"header\">");

        if (!string.IsNullOrWhiteSpace(logoUrl))
        {
            sb.AppendLine($"<img class=\"logo\" src=\"{Html(logoUrl)}\" alt=\"{Html(shopName)} logo\" />");
        }

        sb.AppendLine($"<div class=\"shop-name\">{Html(shopName)}</div>");
        if (!string.IsNullOrWhiteSpace(shopProfile?.AddressLine1))
        {
            sb.AppendLine($"<div class=\"muted\">{Html(shopProfile.AddressLine1!)}</div>");
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.AddressLine2))
        {
            sb.AppendLine($"<div class=\"muted\">{Html(shopProfile.AddressLine2!)}</div>");
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.Phone))
        {
            sb.AppendLine($"<div class=\"muted\">{Html(shopProfile.Phone!)}</div>");
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.Email))
        {
            sb.AppendLine($"<div class=\"muted\">{Html(shopProfile.Email!)}</div>");
        }
        if (!string.IsNullOrWhiteSpace(shopProfile?.Website))
        {
            sb.AppendLine($"<div class=\"muted\">{Html(shopProfile.Website!)}</div>");
        }

        sb.AppendLine("</div>");
        sb.AppendLine("<div class=\"rule\"></div>");
        sb.AppendLine("<div class=\"meta\"><span>INV. NO</span><span>:</span><span>" + Html(sale.SaleNumber) + "</span></div>");
        sb.AppendLine("<div class=\"meta\"><span>DATE</span><span>:</span><span>" + Html(completedAt) + "</span></div>");
        sb.AppendLine("<div class=\"meta\"><span>BY</span><span>:</span><span>POS</span></div>");
        sb.AppendLine("<div class=\"rule\"></div>");

        sb.AppendLine("<table class=\"items\">");
        sb.AppendLine("<thead><tr><th class=\"name\">ITEM NAME</th><th class=\"num\">QTY</th><th class=\"num\">DIS</th><th class=\"num\">TOTAL</th></tr></thead>");
        sb.AppendLine("<tbody>");
        foreach (var item in sale.Items)
        {
            var discount = Math.Max(0m, item.UnitPrice * item.Quantity - item.LineTotal);
            sb.AppendLine("<tr>");
            sb.AppendLine($"<td class=\"name\">{Html(item.ProductName)}</td>");
            sb.AppendLine($"<td class=\"num\">{item.Quantity:0.###}</td>");
            sb.AppendLine($"<td class=\"num\">{discount:0.00}</td>");
            sb.AppendLine($"<td class=\"num\">{item.LineTotal:0.00}</td>");
            sb.AppendLine("</tr>");
        }
        sb.AppendLine("</tbody>");
        sb.AppendLine("</table>");

        sb.AppendLine("<div class=\"totals\">");
        sb.AppendLine($"<div class=\"summary-row\"><span>GROSS PRICE</span><span>{sale.Subtotal:0.00}</span></div>");
        sb.AppendLine($"<div class=\"summary-row\"><span>DISCOUNT</span><span>{sale.DiscountTotal:0.00}</span></div>");
        sb.AppendLine($"<div class=\"summary-row total\"><span>TOTAL</span><span>{sale.GrandTotal:0.00}</span></div>");
        sb.AppendLine("</div>");

        sb.AppendLine("<div class=\"payments\">");
        sb.AppendLine("<h3>PAYMENT</h3>");
        foreach (var payment in sale.PaymentBreakdown)
        {
            sb.AppendLine($"<div class=\"payment-row\"><span>{Html(payment.Method.ToUpperInvariant())}</span><span>{payment.NetAmount:0.00}</span></div>");
        }
        sb.AppendLine($"<div class=\"payment-row\"><span>BALANCE</span><span class=\"balance-negative\">{sale.GrandTotal - sale.PaidTotal:0.00}</span></div>");
        sb.AppendLine("</div>");

        sb.AppendLine("<div class=\"rule\"></div>");
        sb.AppendLine($"<div class=\"footer\">{Html(footer)}</div>");
        sb.AppendLine("</div>");
        sb.AppendLine("""
<script>
  window.addEventListener('load', function () {
    setTimeout(function () {
      window.print();
    }, 250);
  });
  window.addEventListener('afterprint', function () {
    window.close();
  });
</script>
""");
        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        return sb.ToString();
    }

    public static string BuildWhatsappMessage(SaleResponse sale, ShopProfileResponse? shopProfile = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine(GetShopName(shopProfile));
        sb.AppendLine($"Receipt: {sale.SaleNumber}");
        sb.AppendLine($"Date: {ToLocalDateTime(sale).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)}");
        sb.AppendLine();
        sb.AppendLine("Items:");
        foreach (var item in sale.Items)
        {
            sb.AppendLine($"- {item.ProductName} x{item.Quantity:0.###} = LKR {item.LineTotal:0.00}");
        }

        sb.AppendLine();
        sb.AppendLine($"Subtotal: LKR {sale.Subtotal:0.00}");
        sb.AppendLine($"Discount: LKR {sale.DiscountTotal:0.00}");
        sb.AppendLine($"Total: LKR {sale.GrandTotal:0.00}");
        sb.AppendLine($"Paid: LKR {sale.PaidTotal:0.00}");
        sb.AppendLine($"Balance: LKR {sale.GrandTotal - sale.PaidTotal:0.00}");

        if (sale.PaymentBreakdown.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("Payment Breakdown:");
            foreach (var payment in sale.PaymentBreakdown)
            {
                var reversed = payment.ReversedAmount > 0m
                    ? $" (reversed LKR {payment.ReversedAmount:0.00})"
                    : string.Empty;
                sb.AppendLine($"- {payment.Method.ToUpperInvariant()}: LKR {payment.NetAmount:0.00}{reversed}");
            }
        }

        if (!string.IsNullOrWhiteSpace(shopProfile?.ReceiptFooter))
        {
            sb.AppendLine();
            sb.AppendLine(shopProfile.ReceiptFooter);
        }

        return sb.ToString().TrimEnd();
    }

    public static string BuildWhatsappUrl(string message, string? phone)
    {
        var normalizedPhone = NormalizePhone(phone);
        var encodedMessage = Uri.EscapeDataString(message);
        return string.IsNullOrWhiteSpace(normalizedPhone)
            ? $"https://wa.me/?text={encodedMessage}"
            : $"https://wa.me/{normalizedPhone}?text={encodedMessage}";
    }

    public static bool IsReceiptAvailable(SaleResponse sale)
    {
        return sale.Status is "completed" or "refundedfully" or "refundedpartially";
    }

    private static DateTimeOffset ToLocalDateTime(SaleResponse sale)
    {
        var timestamp = sale.CompletedAt ?? sale.CreatedAt;
        return timestamp.ToLocalTime();
    }

    private static string GetShopName(ShopProfileResponse? shopProfile)
    {
        return string.IsNullOrWhiteSpace(shopProfile?.ShopName)
            ? "SmartPOS Lanka"
            : shopProfile.ShopName.Trim();
    }

    private static string Html(string? value)
    {
        return WebUtility.HtmlEncode(value ?? string.Empty);
    }

    private static string NormalizePhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return string.Empty;
        }

        var digits = phone.Where(char.IsDigit).ToArray();
        return new string(digits);
    }

    private static void AppendCentered(StringBuilder sb, string value, int width)
    {
        var text = TrimToWidth(value, width);
        var leftPadding = Math.Max(0, (width - text.Length) / 2);
        sb.Append(' ', leftPadding);
        sb.AppendLine(text);
    }

    private static string AlignLeftRight(string left, string right, int width)
    {
        var leftText = TrimToWidth(left, width);
        var rightText = TrimToWidth(right, width);
        var spaces = width - leftText.Length - rightText.Length;
        if (spaces < 1)
        {
            return TrimToWidth($"{leftText} {rightText}", width);
        }

        return $"{leftText}{new string(' ', spaces)}{rightText}";
    }

    private static string TrimToWidth(string value, int width)
    {
        if (value.Length <= width)
        {
            return value;
        }

        if (width <= 3)
        {
            return value[..width];
        }

        return $"{value[..(width - 3)]}...";
    }
}
