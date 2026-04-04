using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ReminderFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task RunNow_ThenAcknowledge_ShouldGenerateAndUpdateReminderState()
    {
        await TestAuth.SignInAsManagerAsync(client);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var managerId = await dbContext.Users
                .Where(x => x.Username == "manager")
                .Select(x => x.Id)
                .SingleAsync();

            var oldEvents = await dbContext.ReminderEvents
                .Where(x => x.UserId == managerId)
                .ToListAsync();
            var oldJobs = await dbContext.AiSmartReportJobs
                .Where(x => x.UserId == managerId)
                .ToListAsync();

            if (oldEvents.Count > 0)
            {
                dbContext.ReminderEvents.RemoveRange(oldEvents);
            }

            if (oldJobs.Count > 0)
            {
                dbContext.AiSmartReportJobs.RemoveRange(oldJobs);
            }

            await dbContext.SaveChangesAsync();
        }

        var runNowPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync("/api/reminders/run-now", content: null));

        Assert.True((runNowPayload["generated_reports"]?.GetValue<int>() ?? 0) >= 1);
        Assert.True((runNowPayload["created_events"]?.GetValue<int>() ?? 0) >= 1);

        var listPayload = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reminders?take=50&include_acknowledged=true"));
        Assert.True((listPayload["open_count"]?.GetValue<int>() ?? 0) >= 1);

        var items = listPayload["items"]?.AsArray()
                    ?? throw new InvalidOperationException("items not found.");
        var openReminder = items
            .Select(x => x?.AsObject())
            .FirstOrDefault(x => string.Equals(TestJson.GetString(x!, "status"), "open", StringComparison.Ordinal));
        Assert.NotNull(openReminder);

        var reminderId = Guid.Parse(TestJson.GetString(openReminder!, "reminder_id"));
        var ackPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync($"/api/reminders/{reminderId}/ack", content: null));

        Assert.Equal("acknowledged", TestJson.GetString(ackPayload, "status"));

        var openOnlyPayload = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reminders?take=50"));
        var openItems = openOnlyPayload["items"]?.AsArray()
                        ?? throw new InvalidOperationException("items not found.");

        Assert.DoesNotContain(
            openItems,
            x => Guid.Parse(x?["reminder_id"]?.GetValue<string>() ?? string.Empty) == reminderId);
    }

    [Fact]
    public async Task Cashier_ShouldBeAbleToReadReminders_ButNotMutateAdminEndpoints()
    {
        await TestAuth.SignInAsCashierAsync(client);

        var listResponse = await client.GetAsync("/api/reminders?take=10");
        listResponse.EnsureSuccessStatusCode();

        var runNowResponse = await client.PostAsync("/api/reminders/run-now", content: null);
        Assert.Equal(HttpStatusCode.Forbidden, runNowResponse.StatusCode);

        var upsertResponse = await client.PostAsJsonAsync("/api/reminders/rules", new
        {
            reminder_type = "low_stock",
            enabled = true,
            low_stock_threshold = 8m
        });
        Assert.Equal(HttpStatusCode.Forbidden, upsertResponse.StatusCode);
    }

    [Fact]
    public async Task UpsertRule_ShouldPersistLowStockThreshold()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var rulePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/reminders/rules", new
            {
                reminder_type = "low_stock",
                enabled = true,
                low_stock_threshold = 7.5m,
                clear_snooze = true
            }));

        Assert.Equal("low_stock", TestJson.GetString(rulePayload, "reminder_type"));
        Assert.True(rulePayload["enabled"]?.GetValue<bool>() ?? false);
        Assert.Equal(7.5m, TestJson.GetDecimal(rulePayload, "low_stock_threshold"));
    }
}
