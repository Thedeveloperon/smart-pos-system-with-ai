using System.Security.Claims;
using System.Text.Json;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Security;

public sealed class AuditLogService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor)
{
    public void Queue(
        string action,
        string entityName,
        string entityId,
        object? before = null,
        object? after = null)
    {
        var user = httpContextAccessor.HttpContext?.User;
        var userId = ParseGuid(user?.FindFirstValue(ClaimTypes.NameIdentifier));
        var deviceId = ParseGuid(user?.FindFirstValue("device_id"));

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = userId,
            DeviceId = deviceId,
            Action = action,
            EntityName = entityName,
            EntityId = entityId,
            BeforeJson = before is null ? null : JsonSerializer.Serialize(before),
            AfterJson = after is null ? null : JsonSerializer.Serialize(after),
            CreatedAtUtc = DateTimeOffset.UtcNow
        });
    }

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }
}
