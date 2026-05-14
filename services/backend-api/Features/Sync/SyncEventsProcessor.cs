using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Sync;

public sealed class SyncEventsProcessor(
    SmartPosDbContext dbContext,
    LicenseService licenseService,
    ILogger<SyncEventsProcessor> logger)
{
    public async Task<SyncEventsResponse> ProcessAsync(
        SyncEventsRequest request,
        string requestDeviceCode,
        CancellationToken cancellationToken)
    {
        var response = new SyncEventsResponse();
        var normalizedDeviceCode = requestDeviceCode?.Trim() ?? string.Empty;
        OfflineGrantWindowState? grantWindow = null;
        string? offlineGrantRejectionMessage = null;

        if (request.Events.Any(item => RequiresOfflineGrant(item.Type)))
        {
            try
            {
                var snapshot = await licenseService.ValidateOfflineGrantForSyncAsync(
                    request.OfflineGrantToken,
                    normalizedDeviceCode,
                    cancellationToken);
                grantWindow = new OfflineGrantWindowState(snapshot);
            }
            catch (LicenseException ex)
            {
                offlineGrantRejectionMessage = MapOfflineGrantErrorCodeToMessage(ex.Code);
            }
        }

        foreach (var item in request.Events)
        {
            var result = await ProcessSingleEventAsync(
                request.DeviceId,
                item,
                grantWindow,
                offlineGrantRejectionMessage,
                cancellationToken);
            response.Results.Add(result);
        }

        return response;
    }

    private async Task<SyncEventResult> ProcessSingleEventAsync(
        Guid? requestDeviceId,
        SyncEventRequestItem item,
        OfflineGrantWindowState? grantWindow,
        string? offlineGrantRejectionMessage,
        CancellationToken cancellationToken)
    {
        if (item.EventId == Guid.Empty)
        {
            return new SyncEventResult
            {
                EventId = item.EventId,
                Status = ToContractStatus(OfflineEventStatus.Rejected),
                Message = "invalid_event_id"
            };
        }

        var normalizedEventId = item.EventId.ToString().ToUpperInvariant();

        var existingEvent = await dbContext.OfflineEvents
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.EventId == normalizedEventId, cancellationToken);

        if (existingEvent is not null)
        {
            return new SyncEventResult
            {
                EventId = ParseEventIdOrDefault(existingEvent.EventId),
                Status = ToContractStatus(existingEvent.Status),
                ServerTimestamp = existingEvent.ServerTimestampUtc,
                Message = "duplicate_event_ignored"
            };
        }

        var serverTimestamp = DateTimeOffset.UtcNow;
        var record = new OfflineEvent
        {
            EventId = normalizedEventId,
            StoreId = item.StoreId,
            DeviceId = item.DeviceId ?? requestDeviceId,
            DeviceTimestampUtc = item.DeviceTimestamp,
            ServerTimestampUtc = serverTimestamp,
            PayloadJson = ToPayloadJson(item.Payload),
            Status = OfflineEventStatus.Pending,
            CreatedAtUtc = serverTimestamp,
            UpdatedAtUtc = serverTimestamp
        };

        if (!TryParseEventType(item.Type, out var eventType))
        {
            record.Type = OfflineEventType.Sale;
            record.Status = OfflineEventStatus.Rejected;
            record.RejectionReason = "invalid_event_type";
            dbContext.OfflineEvents.Add(record);
            await dbContext.SaveChangesAsync(cancellationToken);

            return new SyncEventResult
            {
                EventId = item.EventId,
                Status = ToContractStatus(record.Status),
                ServerTimestamp = record.ServerTimestampUtc,
                Message = record.RejectionReason
            };
        }

        record.Type = eventType;
        var processMessage = "accepted";

        if (eventType == OfflineEventType.StockUpdate)
        {
            var outcome = await ProcessStockUpdateAsync(item, serverTimestamp, cancellationToken);
            record.Status = outcome.Status;
            record.RejectionReason = outcome.Message;
            processMessage = outcome.Message ?? "processed";
        }
        else if (eventType is OfflineEventType.Sale or OfflineEventType.Refund)
        {
            if (!string.IsNullOrWhiteSpace(offlineGrantRejectionMessage))
            {
                record.Status = OfflineEventStatus.Rejected;
                record.RejectionReason = offlineGrantRejectionMessage;
            }
            else if (grantWindow is null)
            {
                record.Status = OfflineEventStatus.Rejected;
                record.RejectionReason = "offline_grant_required";
            }
            else if (!grantWindow.TryReserve(eventType, out var limitExceededMessage))
            {
                record.Status = OfflineEventStatus.Rejected;
                record.RejectionReason = limitExceededMessage;
            }
            else
            {
                record.OfflineGrantId = grantWindow.GrantId;
                record.OfflineGrantIssuedAtUtc = grantWindow.IssuedAt;
                record.OfflineGrantExpiresAtUtc = grantWindow.ExpiresAt;
                record.Status = OfflineEventStatus.Synced;
                processMessage = "offline_event_synced";
            }
        }
        else
        {
            record.Status = OfflineEventStatus.Synced;
        }

        if (record.Status == OfflineEventStatus.Rejected)
        {
            processMessage = record.RejectionReason ?? "event_rejected";
        }

        dbContext.OfflineEvents.Add(record);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new SyncEventResult
        {
            EventId = item.EventId,
            Status = ToContractStatus(record.Status),
            ServerTimestamp = record.ServerTimestampUtc,
            Message = processMessage
        };
    }

    private async Task<(OfflineEventStatus Status, string? Message)> ProcessStockUpdateAsync(
        SyncEventRequestItem item,
        DateTimeOffset serverTimestamp,
        CancellationToken cancellationToken)
    {
        if (!TryGetGuid(item.Payload, "product_id", "productId", out var productId))
        {
            return (OfflineEventStatus.Rejected, "invalid_payload_product_id");
        }

        var inventory = await dbContext.Inventory
            .FirstOrDefaultAsync(x => x.ProductId == productId, cancellationToken);

        if (inventory is null)
        {
            return (OfflineEventStatus.Conflict, "stock_conflict_inventory_not_found");
        }

        if (item.DeviceTimestamp < inventory.UpdatedAtUtc)
        {
            // Last-write-wins: stale updates are accepted but ignored.
            return (OfflineEventStatus.Synced, "stale_update_ignored_last_write_wins");
        }

        if (TryGetDecimal(item.Payload, "quantity_on_hand", "quantityOnHand", out var quantityOnHand))
        {
            inventory.QuantityOnHand = quantityOnHand;
        }
        else if (TryGetDecimal(item.Payload, "delta_quantity", "deltaQuantity", out var deltaQuantity))
        {
            inventory.QuantityOnHand += deltaQuantity;
        }
        else
        {
            return (OfflineEventStatus.Rejected, "invalid_payload_quantity");
        }

        inventory.UpdatedAtUtc = serverTimestamp;
        logger.LogInformation("Stock update applied for product {ProductId}", productId);

        return (OfflineEventStatus.Synced, "stock_update_applied");
    }

    private static bool TryParseEventType(string value, out OfflineEventType eventType)
    {
        switch (value)
        {
            case "sale":
                eventType = OfflineEventType.Sale;
                return true;
            case "refund":
                eventType = OfflineEventType.Refund;
                return true;
            case "stock_update":
                eventType = OfflineEventType.StockUpdate;
                return true;
            default:
                eventType = OfflineEventType.Sale;
                return false;
        }
    }

    private static bool RequiresOfflineGrant(string? rawType)
    {
        return string.Equals(rawType?.Trim(), "sale", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(rawType?.Trim(), "refund", StringComparison.OrdinalIgnoreCase);
    }

    private static string MapOfflineGrantErrorCodeToMessage(string code)
    {
        return code switch
        {
            LicenseErrorCodes.OfflineGrantRequired => "offline_grant_required",
            LicenseErrorCodes.OfflineGrantExpired => "offline_grant_expired",
            LicenseErrorCodes.OfflineGrantLimitExceeded => "offline_grant_limit_exceeded",
            LicenseErrorCodes.DeviceMismatch => "offline_grant_device_mismatch",
            LicenseErrorCodes.DeviceKeyMismatch => "offline_grant_device_key_mismatch",
            LicenseErrorCodes.InvalidToken => "offline_grant_invalid",
            _ => "offline_grant_invalid"
        };
    }

    private static string ToPayloadJson(JsonElement payload)
    {
        return payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null
            ? "{}"
            : payload.GetRawText();
    }

    private static bool TryGetGuid(JsonElement payload, string snakeCase, string camelCase, out Guid value)
    {
        value = Guid.Empty;
        if (!TryGetProperty(payload, snakeCase, camelCase, out var property))
        {
            return false;
        }

        return property.ValueKind == JsonValueKind.String && Guid.TryParse(property.GetString(), out value);
    }

    private static bool TryGetDecimal(JsonElement payload, string snakeCase, string camelCase, out decimal value)
    {
        value = default;
        if (!TryGetProperty(payload, snakeCase, camelCase, out var property))
        {
            return false;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number => property.TryGetDecimal(out value),
            JsonValueKind.String => decimal.TryParse(property.GetString(), out value),
            _ => false
        };
    }

    private static bool TryGetProperty(
        JsonElement payload,
        string snakeCase,
        string camelCase,
        out JsonElement property)
    {
        property = default;
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        return payload.TryGetProperty(snakeCase, out property) ||
               payload.TryGetProperty(camelCase, out property);
    }

    private static string ToContractStatus(OfflineEventStatus status)
    {
        return status switch
        {
            OfflineEventStatus.Pending => "pending",
            OfflineEventStatus.Synced => "synced",
            OfflineEventStatus.Conflict => "conflict",
            OfflineEventStatus.Rejected => "rejected",
            _ => "rejected"
        };
    }

    private static Guid ParseEventIdOrDefault(string eventId)
    {
        return Guid.TryParse(eventId, out var parsedEventId) ? parsedEventId : Guid.Empty;
    }

    private sealed class OfflineGrantWindowState
    {
        public OfflineGrantWindowState(OfflineGrantValidationSnapshot snapshot)
        {
            GrantId = snapshot.GrantId;
            IssuedAt = snapshot.IssuedAt;
            ExpiresAt = snapshot.ExpiresAt;
            maxCheckoutOperations = Math.Max(0, snapshot.MaxCheckoutOperations);
            maxRefundOperations = Math.Max(0, snapshot.MaxRefundOperations);
            usedCheckoutOperations = Math.Max(0, snapshot.UsedCheckoutOperations);
            usedRefundOperations = Math.Max(0, snapshot.UsedRefundOperations);
        }

        public Guid GrantId { get; }
        public DateTimeOffset IssuedAt { get; }
        public DateTimeOffset ExpiresAt { get; }

        private int usedCheckoutOperations;
        private int usedRefundOperations;
        private readonly int maxCheckoutOperations;
        private readonly int maxRefundOperations;

        public bool TryReserve(OfflineEventType eventType, out string rejectionMessage)
        {
            rejectionMessage = string.Empty;
            if (eventType == OfflineEventType.Sale)
            {
                if (usedCheckoutOperations >= maxCheckoutOperations)
                {
                    rejectionMessage = "offline_grant_checkout_limit_exceeded";
                    return false;
                }

                usedCheckoutOperations += 1;
                return true;
            }

            if (eventType == OfflineEventType.Refund)
            {
                if (usedRefundOperations >= maxRefundOperations)
                {
                    rejectionMessage = "offline_grant_refund_limit_exceeded";
                    return false;
                }

                usedRefundOperations += 1;
                return true;
            }

            rejectionMessage = "offline_grant_not_required";
            return true;
        }
    }
}
