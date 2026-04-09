using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Security;

public sealed class CloudWriteReliabilityMiddleware(
    RequestDelegate next,
    ILogger<CloudWriteReliabilityMiddleware> logger)
{
    private static readonly SemaphoreSlim CleanupLock = new(1, 1);
    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);
    private static DateTimeOffset lastCleanupAtUtc = DateTimeOffset.MinValue;
    private const int ResponseBodyReplayLimit = 256_000;
    private const int IdempotencyRetentionHours = 72;

    public async Task InvokeAsync(
        HttpContext httpContext,
        SmartPosDbContext dbContext)
    {
        if (!CloudWriteRequestContract.IsProtectedWrite(httpContext.Request.Path, httpContext.Request.Method))
        {
            await next(httpContext);
            return;
        }

        if (!CloudWriteRequestContract.TryResolveHeaders(httpContext, out var headers, out var contractError))
        {
            httpContext.Response.StatusCode = contractError.StatusCode;
            await httpContext.Response.WriteAsJsonAsync(contractError.Payload);
            return;
        }

        CloudWriteRequestContract.EnsureLegacyDeviceCodeHeader(httpContext, headers.DeviceId);

        await TryCleanupExpiredAsync(dbContext, httpContext.RequestAborted);

        var requestHash = await ComputeRequestHashAsync(httpContext.Request, httpContext.RequestAborted);
        var now = DateTimeOffset.UtcNow;
        var existing = await FindActiveRecordAsync(
            dbContext,
            headers.EndpointKey,
            headers.DeviceId,
            headers.IdempotencyKey,
            requestHash,
            now,
            httpContext.RequestAborted);

        if (existing is not null)
        {
            await HandleExistingRecordAsync(httpContext, dbContext, existing);
            return;
        }

        var record = new CloudWriteIdempotencyRecord
        {
            EndpointKey = headers.EndpointKey,
            DeviceId = headers.DeviceId,
            IdempotencyKey = headers.IdempotencyKey,
            PosVersion = headers.PosVersion,
            RequestHash = requestHash,
            CreatedAtUtc = now,
            LastSeenAtUtc = now,
            ExpiresAtUtc = now.AddHours(IdempotencyRetentionHours)
        };

        dbContext.CloudWriteIdempotencyRecords.Add(record);
        try
        {
            await dbContext.SaveChangesAsync(httpContext.RequestAborted);
        }
        catch (DbUpdateException)
        {
            var conflicted = await FindActiveRecordAsync(
                dbContext,
                headers.EndpointKey,
                headers.DeviceId,
                headers.IdempotencyKey,
                requestHash,
                now,
                httpContext.RequestAborted);

            if (conflicted is not null)
            {
                await HandleExistingRecordAsync(httpContext, dbContext, conflicted);
                return;
            }

            throw;
        }

        var originalBody = httpContext.Response.Body;
        await using var responseBuffer = new MemoryStream();
        httpContext.Response.Body = responseBuffer;
        try
        {
            await next(httpContext);

            responseBuffer.Position = 0;
            string responseBody;
            using (var reader = new StreamReader(responseBuffer, Encoding.UTF8, leaveOpen: true))
            {
                responseBody = await reader.ReadToEndAsync(httpContext.RequestAborted);
            }

            if (httpContext.Response.StatusCode >= 200 &&
                httpContext.Response.StatusCode < 300 &&
                responseBody.Length <= ResponseBodyReplayLimit)
            {
                record.ResponseStatusCode = httpContext.Response.StatusCode;
                record.ResponseContentType = httpContext.Response.ContentType;
                record.ResponseBody = responseBody;
                record.CompletedAtUtc = DateTimeOffset.UtcNow;
                record.LastSeenAtUtc = record.CompletedAtUtc.Value;
                await dbContext.SaveChangesAsync(httpContext.RequestAborted);
            }
            else if (httpContext.Response.StatusCode >= 500 || httpContext.Response.StatusCode >= 400)
            {
                dbContext.CloudWriteIdempotencyRecords.Remove(record);
                await dbContext.SaveChangesAsync(httpContext.RequestAborted);
            }
            else if (responseBody.Length > ResponseBodyReplayLimit)
            {
                dbContext.CloudWriteIdempotencyRecords.Remove(record);
                await dbContext.SaveChangesAsync(httpContext.RequestAborted);
                logger.LogWarning(
                    "Cloud write response exceeded replay size limit. endpoint={EndpointKey}, idempotency_key={IdempotencyKey}, size={Size}",
                    headers.EndpointKey,
                    headers.IdempotencyKey,
                    responseBody.Length);
            }

            responseBuffer.Position = 0;
            await responseBuffer.CopyToAsync(originalBody, httpContext.RequestAborted);
        }
        catch
        {
            await DeleteRecordSafelyAsync(dbContext, record, httpContext.RequestAborted);
            throw;
        }
        finally
        {
            httpContext.Response.Body = originalBody;
        }
    }

    private static async Task HandleExistingRecordAsync(
        HttpContext httpContext,
        SmartPosDbContext dbContext,
        CloudWriteIdempotencyRecord record)
    {
        record.LastSeenAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(httpContext.RequestAborted);

        if (record.ResponseStatusCode.HasValue)
        {
            httpContext.Response.StatusCode = record.ResponseStatusCode.Value;
            if (!string.IsNullOrWhiteSpace(record.ResponseContentType))
            {
                httpContext.Response.ContentType = record.ResponseContentType;
            }

            httpContext.Response.Headers["X-Idempotency-Replayed"] = "true";
            if (!string.IsNullOrEmpty(record.ResponseBody))
            {
                await httpContext.Response.WriteAsync(record.ResponseBody, httpContext.RequestAborted);
            }

            return;
        }

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = "IDEMPOTENCY_REQUEST_IN_PROGRESS",
                Message = "The request is already in progress. Retry with the same idempotency key shortly."
            }
        });
    }

    private static async Task<string> ComputeRequestHashAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        request.EnableBuffering();
        request.Body.Position = 0;

        await using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, cancellationToken);
        request.Body.Position = 0;

        var prefix = $"{request.Method.ToUpperInvariant()}\n{(request.Path.Value ?? string.Empty).Trim().ToLowerInvariant()}\n{request.QueryString.Value ?? string.Empty}\n{request.ContentType ?? string.Empty}\n";
        var prefixBytes = Encoding.UTF8.GetBytes(prefix);
        var payloadBytes = buffer.ToArray();
        var combined = new byte[prefixBytes.Length + payloadBytes.Length];
        Buffer.BlockCopy(prefixBytes, 0, combined, 0, prefixBytes.Length);
        Buffer.BlockCopy(payloadBytes, 0, combined, prefixBytes.Length, payloadBytes.Length);
        return Convert.ToHexString(SHA256.HashData(combined)).ToLowerInvariant();
    }

    private static async Task DeleteRecordSafelyAsync(
        SmartPosDbContext dbContext,
        CloudWriteIdempotencyRecord record,
        CancellationToken cancellationToken)
    {
        try
        {
            dbContext.CloudWriteIdempotencyRecords.Remove(record);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Best-effort cleanup only.
        }
    }

    private static async Task TryCleanupExpiredAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        if (now - lastCleanupAtUtc < CleanupInterval)
        {
            return;
        }

        if (!await CleanupLock.WaitAsync(0, cancellationToken))
        {
            return;
        }

        try
        {
            if (now - lastCleanupAtUtc < CleanupInterval)
            {
                return;
            }

            List<CloudWriteIdempotencyRecord> expired;
            if (dbContext.Database.IsSqlite())
            {
                expired = (await dbContext.CloudWriteIdempotencyRecords
                        .ToListAsync(cancellationToken))
                    .Where(x => x.ExpiresAtUtc <= now)
                    .ToList();
            }
            else
            {
                expired = await dbContext.CloudWriteIdempotencyRecords
                    .Where(x => x.ExpiresAtUtc <= now)
                    .ToListAsync(cancellationToken);
            }
            if (expired.Count > 0)
            {
                dbContext.CloudWriteIdempotencyRecords.RemoveRange(expired);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            lastCleanupAtUtc = now;
        }
        finally
        {
            CleanupLock.Release();
        }
    }

    private static async Task<CloudWriteIdempotencyRecord?> FindActiveRecordAsync(
        SmartPosDbContext dbContext,
        string endpointKey,
        string deviceId,
        string idempotencyKey,
        string requestHash,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsSqlite())
        {
            var candidates = await dbContext.CloudWriteIdempotencyRecords
                .Where(x => x.EndpointKey == endpointKey &&
                            x.DeviceId == deviceId &&
                            x.IdempotencyKey == idempotencyKey &&
                            x.RequestHash == requestHash)
                .ToListAsync(cancellationToken);
            return candidates.FirstOrDefault(x => x.ExpiresAtUtc > now);
        }

        return await dbContext.CloudWriteIdempotencyRecords
            .FirstOrDefaultAsync(
                x => x.EndpointKey == endpointKey &&
                     x.DeviceId == deviceId &&
                     x.IdempotencyKey == idempotencyKey &&
                     x.RequestHash == requestHash &&
                     x.ExpiresAtUtc > now,
                cancellationToken);
    }
}
