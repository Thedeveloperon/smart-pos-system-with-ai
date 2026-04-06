using System.Text;
using SmartPos.Backend.Features.Reports;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed class CashierOperationsGroundingHandler(
    ReportService reportService) : IAiChatGroundingHandler
{
    public IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; } = [AiChatIntentType.CashierOperations];

    public async Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken)
    {
        var citations = new List<AiChatCitationResponse>();
        var missingData = new List<string>();
        var content = new StringBuilder();

        var fromDate = context.Entities.DateRange?.FromDate;
        var toDate = context.Entities.DateRange?.ToDate;
        var dateLabel = context.Entities.DateRange?.Label ?? "last 7 days";

        var leaderboard = await reportService.GetCashierLeaderboardSnapshotAsync(
            fromDate,
            toDate,
            5,
            cancellationToken);
        var topCashier = leaderboard.Rows.FirstOrDefault();
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.cashier.leaderboard.{leaderboard.FromDate:yyyyMMdd}.{leaderboard.ToDate:yyyyMMdd}",
            Title = "Cashier leaderboard",
            Summary = topCashier is null
                ? "No cashier leaderboard rows found for the selected period."
                : $"Top cashier is {topCashier.CashierLabel} with net sales {topCashier.NetSales:0.##} across {topCashier.TransactionCount} transactions."
        });

        var transactions = await reportService.GetTransactionsReportAsync(fromDate, toDate, 50, cancellationToken);
        var refundTransactions = transactions.Items.Count(x => x.Status.Contains("refund", StringComparison.OrdinalIgnoreCase));
        citations.Add(new AiChatCitationResponse
        {
            BucketKey = $"reports.transactions.{transactions.FromDate:yyyyMMdd}.{transactions.ToDate:yyyyMMdd}",
            Title = "Cashier transaction operations",
            Summary = $"{transactions.TransactionCount} transactions, net collected {transactions.NetCollectedTotal:0.##}, reverse total {transactions.ReversedTotal:0.##}."
        });

        content.AppendLine($"Cashier and operations snapshot ({dateLabel}):");
        content.AppendLine($"- Date range: {transactions.FromDate:yyyy-MM-dd} to {transactions.ToDate:yyyy-MM-dd}");
        content.AppendLine($"- Transactions: {transactions.TransactionCount}, net collected: {transactions.NetCollectedTotal:0.##}, reversals: {transactions.ReversedTotal:0.##}");
        content.AppendLine($"- Transactions marked with refund status: {refundTransactions}");

        foreach (var row in leaderboard.Rows.Take(3))
        {
            content.AppendLine($"- {row.CashierLabel}: transactions={row.TransactionCount}, net_sales={row.NetSales:0.##}");
        }

        if (context.Entities.Cashier is not null)
        {
            var cashierRow = leaderboard.Rows.FirstOrDefault(x => x.CashierId == context.Entities.Cashier.Id);
            if (cashierRow is null)
            {
                missingData.Add($"No leaderboard row found for cashier '{context.Entities.Cashier.Name}' in the selected period.");
            }
            else
            {
                citations.Add(new AiChatCitationResponse
                {
                    BucketKey = $"reports.cashier.detail.{cashierRow.CashierId:N}",
                    Title = "Requested cashier detail",
                    Summary = $"{cashierRow.CashierLabel}: transactions {cashierRow.TransactionCount}, net sales {cashierRow.NetSales:0.##}."
                });
            }
        }
        else if (context.Entities.MentionsCashier)
        {
            missingData.Add("Cashier was mentioned but could not be matched. Provide an exact username or full name.");
        }

        return new AiChatGroundingResult(
            ContextText: content.ToString().Trim(),
            Citations: citations,
            MissingData: missingData,
            Confidence: ResolveConfidence(citations.Count, missingData.Count),
            IsUnsupported: false);
    }

    private static string ResolveConfidence(int citationCount, int missingDataCount)
    {
        if (citationCount >= 3 && missingDataCount == 0)
        {
            return "high";
        }

        if (citationCount >= 1)
        {
            return "medium";
        }

        return "low";
    }
}
