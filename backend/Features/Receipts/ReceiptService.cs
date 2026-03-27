using System.Text;
using SmartPos.Backend.Features.Checkout;

namespace SmartPos.Backend.Features.Receipts;

public sealed class ReceiptService(CheckoutService checkoutService)
{
    public async Task<SaleResponse?> GetReceiptAsync(Guid saleId, CancellationToken cancellationToken)
    {
        return await checkoutService.GetSaleAsync(saleId, cancellationToken);
    }

    public static string BuildThermalText(SaleResponse sale)
    {
        const int width = 32;
        var separator = new string('-', width);
        var sb = new StringBuilder();

        AppendCentered(sb, "SMARTPOS LANKA", width);
        AppendCentered(sb, "Receipt", width);
        sb.AppendLine(separator);
        sb.AppendLine($"Sale: {sale.SaleNumber}");
        sb.AppendLine($"Date: {sale.CompletedAt?.ToString("yyyy-MM-dd HH:mm") ?? sale.CreatedAt.ToString("yyyy-MM-dd HH:mm")}");
        sb.AppendLine($"Status: {sale.Status.ToUpperInvariant()}");
        sb.AppendLine(separator);

        foreach (var item in sale.Items)
        {
            sb.AppendLine(TrimToWidth(item.ProductName, width));
            var qtyPrice = $"{item.Quantity:0.###} x {item.UnitPrice:0.00}";
            var lineTotal = $"LKR {item.LineTotal:0.00}";
            sb.AppendLine(AlignLeftRight(qtyPrice, lineTotal, width));
        }

        sb.AppendLine(separator);
        sb.AppendLine(AlignLeftRight("Subtotal", $"LKR {sale.Subtotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Discount", $"-LKR {sale.DiscountTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Total", $"LKR {sale.GrandTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Paid", $"LKR {sale.PaidTotal:0.00}", width));
        sb.AppendLine(AlignLeftRight("Change", $"LKR {sale.Change:0.00}", width));
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

        AppendCentered(sb, "Thank you!", width);
        return sb.ToString();
    }

    public static string BuildWhatsappMessage(SaleResponse sale)
    {
        var sb = new StringBuilder();
        sb.AppendLine("SmartPOS Lanka");
        sb.AppendLine($"Receipt: {sale.SaleNumber}");
        sb.AppendLine($"Date: {sale.CompletedAt?.ToString("yyyy-MM-dd HH:mm") ?? sale.CreatedAt.ToString("yyyy-MM-dd HH:mm")}");
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
        sb.AppendLine($"Change: LKR {sale.Change:0.00}");

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

        sb.AppendLine();
        sb.AppendLine("Thank you for shopping with us.");

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
