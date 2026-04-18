using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Auth;

public sealed class AuthService(
    SmartPosDbContext dbContext,
    JwtCookieOptions jwtOptions,
    IOptions<AuthSecurityOptions> authSecurityOptionsAccessor,
    IHttpContextAccessor httpContextAccessor,
    ILicensingAlertMonitor licensingAlertMonitor)
{
    private const string StaticSuperAdminMfaCode = "123456";
    private readonly AuthSecurityOptions authSecurityOptions = authSecurityOptionsAccessor.Value;

    public async Task<(string Token, AuthSessionResponse Session)> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var source = RequestSourceContext.FromHttpContext(httpContextAccessor.HttpContext);
        var now = DateTimeOffset.UtcNow;
        var username = request.Username?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var terminalId = NormalizeOptionalValue(request.TerminalId) ??
                         NormalizeOptionalValue(request.DeviceCode) ??
                         string.Empty;
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Username and password are required.");
        }

        var normalizedUsername = username.ToLowerInvariant();
        var user = await dbContext.Users
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(
                x => x.IsActive && x.Username.ToLower() == normalizedUsername,
                cancellationToken);

        if (user is null)
        {
            await RecordUnknownUserFailureAsync(normalizedUsername, source, now, cancellationToken);
            await ApplyFailureThrottleDelayAsync(cancellationToken);
            throw new InvalidOperationException("Invalid username or password.");
        }

        if (IsLockoutActive(user, now))
        {
            await RecordLockoutBlockedAttemptAsync(user, source, now, cancellationToken);
            await ApplyFailureThrottleDelayAsync(cancellationToken);
            throw new InvalidOperationException("Account is temporarily locked due to repeated failures. Please try again later.");
        }

        if (!PasswordHashing.VerifyPassword(user, user.PasswordHash, password))
        {
            await RegisterFailedLoginAttemptAsync(user, source, now, "invalid_password", cancellationToken);
            await ApplyFailureThrottleDelayAsync(cancellationToken);
            throw new InvalidOperationException("Invalid username or password.");
        }

        var (role, superAdminScope) = ResolveRoleAndScope(user);
        var isSuperAdminScope = SmartPosRoles.IsSuperAdminRole(role);
        var resolvedTerminalId = ResolveLoginDeviceCode(terminalId, user, isSuperAdminScope);
        bool mfaVerified;
        if (isSuperAdminScope)
        {
            // Temporary product decision: admin portal login requires username/password only.
            mfaVerified = true;
        }
        else
        {
            try
            {
                mfaVerified = ValidateMfa(user, role, request.MfaCode);
            }
            catch (InvalidOperationException exception)
            {
                if (!exception.Message.Contains("not configured for MFA", StringComparison.OrdinalIgnoreCase))
                {
                    await RegisterFailedLoginAttemptAsync(user, source, now, "invalid_mfa", cancellationToken);
                    await ApplyFailureThrottleDelayAsync(cancellationToken);
                }

                throw;
            }
        }

        ResetFailedLoginState(user);

        var expiresAt = now.AddMinutes(Math.Max(15, jwtOptions.ExpiryMinutes));

        var device = await dbContext.Devices
            .FirstOrDefaultAsync(x => x.DeviceCode == resolvedTerminalId, cancellationToken);

        if (device is null)
        {
            device = new Device
            {
                AppUserId = user.Id,
                DeviceCode = resolvedTerminalId,
                Name = string.IsNullOrWhiteSpace(request.DeviceName)
                    ? isSuperAdminScope ? "Admin Portal" : "POS Browser"
                    : request.DeviceName.Trim(),
                IsTrusted = true,
                AuthSessionVersion = 1,
                CreatedAtUtc = now,
                LastAuthIssuedAtUtc = now,
                LastSeenAtUtc = now
            };
            dbContext.Devices.Add(device);
        }
        else
        {
            device.AppUserId = user.Id;
            device.Name = string.IsNullOrWhiteSpace(request.DeviceName)
                ? device.Name
                : request.DeviceName.Trim();
            device.IsTrusted = true;
            device.AuthSessionVersion = Math.Max(1, device.AuthSessionVersion);
            device.AuthSessionRevokedAtUtc = null;
            device.AuthSessionRevocationReason = null;
            device.LastAuthIssuedAtUtc = now;
            device.LastSeenAtUtc = now;
        }

        var anomalies = await DetectAuthAnomaliesAsync(
            user.Id,
            device.Id,
            source,
            now,
            cancellationToken);

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            DeviceId = device.Id,
            Action = "auth_login",
            EntityName = "auth_session",
            EntityId = device.Id.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                username = user.Username,
                role,
                mfa_verified = mfaVerified,
                source_ip = source.SourceIp,
                source_ip_prefix = source.SourceIpPrefix,
                source_forwarded_for = source.ForwardedFor,
                source_user_agent = source.UserAgent,
                source_user_agent_family = source.UserAgentFamily,
                source_fingerprint = source.SourceFingerprint,
                auth_session_version = device.AuthSessionVersion
            }),
            CreatedAtUtc = now
        });
        foreach (var anomaly in anomalies)
        {
            dbContext.AuditLogs.Add(new AuditLog
            {
                UserId = user.Id,
                DeviceId = device.Id,
                Action = anomaly.Action,
                EntityName = "auth_security",
                EntityId = user.Id.ToString(),
                AfterJson = anomaly.MetadataJson,
                CreatedAtUtc = now
            });
            licensingAlertMonitor.RecordSecurityAnomaly(anomaly.AlertReason);
        }

        user.LastLoginAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);

        var token = BuildToken(user, role, device, expiresAt, mfaVerified, superAdminScope, includeLegacyDeviceClaims: true);
        var session = new AuthSessionResponse
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = role,
            SuperAdminScope = NormalizeOptionalValue(superAdminScope)?.ToLowerInvariant(),
            SessionId = device.Id,
            TerminalId = device.DeviceCode,
            DeviceId = device.Id,
            DeviceCode = device.DeviceCode,
            ExpiresAt = expiresAt,
            MfaVerified = mfaVerified,
            AuthSessionVersion = Math.Max(1, device.AuthSessionVersion)
        };

        return (token, session);
    }

    public async Task<(string Token, AccountSessionResponse Session)> LoginAccountAsync(
        AccountLoginRequest request,
        CancellationToken cancellationToken)
    {
        var delegatedRequest = new LoginRequest
        {
            Username = request.Username,
            Password = request.Password,
            MfaCode = request.MfaCode,
            DeviceName = "Cloud Portal Session"
        };
        var (_, delegatedSession) = await LoginAsync(delegatedRequest, cancellationToken);

        var user = await dbContext.Users
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == delegatedSession.UserId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Authenticated user is not available.");
        var (resolvedRole, superAdminScope) = ResolveRoleAndScope(user);
        var sessionEntity = await dbContext.Devices
            .FirstOrDefaultAsync(
                x => x.Id == delegatedSession.SessionId &&
                     x.AppUserId == delegatedSession.UserId,
                cancellationToken)
            ?? throw new InvalidOperationException("Authenticated session is invalid.");
        if (sessionEntity.AuthSessionVersion < 2)
        {
            sessionEntity.AuthSessionVersion = 2;
            sessionEntity.LastAuthIssuedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        var token = BuildToken(
            user,
            resolvedRole,
            sessionEntity,
            delegatedSession.ExpiresAt,
            delegatedSession.MfaVerified,
            superAdminScope,
            includeLegacyDeviceClaims: false);
        var shop = user.StoreId.HasValue && user.StoreId.Value != Guid.Empty
            ? await dbContext.Shops
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == user.StoreId.Value, cancellationToken)
            : null;

        return (token, new AccountSessionResponse
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = resolvedRole,
            SuperAdminScope = NormalizeOptionalValue(superAdminScope)?.ToLowerInvariant(),
            SessionId = delegatedSession.SessionId,
            ShopId = shop?.Id,
            ShopCode = shop?.Code,
            ExpiresAt = delegatedSession.ExpiresAt,
            MfaVerified = delegatedSession.MfaVerified,
            AuthSessionVersion = Math.Max(1, sessionEntity.AuthSessionVersion)
        });
    }

    public async Task<AuthSessionResponse?> GetCurrentSessionAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var sessionId = ParseGuid(principal.FindFirstValue("session_id"));
        var role = principal.FindFirstValue(ClaimTypes.Role);
        var superAdminScope = NormalizeOptionalValue(principal.FindFirstValue("super_admin_scope"))?.ToLowerInvariant();
        var expiresAtUnix = principal.FindFirstValue(JwtRegisteredClaimNames.Exp);
        var mfaVerifiedClaim = principal.FindFirstValue("mfa_verified");
        var mfaVerified = bool.TryParse(mfaVerifiedClaim, out var parsedMfaVerified) && parsedMfaVerified;

        if (!userId.HasValue || !sessionId.HasValue || string.IsNullOrWhiteSpace(role))
        {
            return null;
        }

        var user = await dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId.Value && x.IsActive, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var device = await dbContext.Devices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == sessionId.Value && x.AppUserId == user.Id, cancellationToken);
        if (device is null)
        {
            return null;
        }

        DateTimeOffset expiresAt;
        if (long.TryParse(expiresAtUnix, out var expUnix))
        {
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(expUnix);
        }
        else
        {
            expiresAt = DateTimeOffset.UtcNow;
        }

        return new AuthSessionResponse
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = role,
            SuperAdminScope = superAdminScope,
            SessionId = device.Id,
            TerminalId = device.DeviceCode,
            DeviceId = device.Id,
            DeviceCode = device.DeviceCode,
            ExpiresAt = expiresAt,
            MfaVerified = mfaVerified,
            AuthSessionVersion = Math.Max(1, device.AuthSessionVersion)
        };
    }

    public async Task<AccountSessionResponse?> GetCurrentAccountSessionAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var sessionId = ParseGuid(principal.FindFirstValue("session_id"));
        var role = principal.FindFirstValue(ClaimTypes.Role);
        var superAdminScope = NormalizeOptionalValue(principal.FindFirstValue("super_admin_scope"))?.ToLowerInvariant();
        var expiresAtUnix = principal.FindFirstValue(JwtRegisteredClaimNames.Exp);
        var mfaVerifiedClaim = principal.FindFirstValue("mfa_verified");
        var mfaVerified = bool.TryParse(mfaVerifiedClaim, out var parsedMfaVerified) && parsedMfaVerified;

        if (!userId.HasValue || !sessionId.HasValue || string.IsNullOrWhiteSpace(role))
        {
            return null;
        }

        var user = await dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId.Value && x.IsActive, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var sessionEntity = await dbContext.Devices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == sessionId.Value && x.AppUserId == user.Id, cancellationToken);
        if (sessionEntity is null)
        {
            return null;
        }

        DateTimeOffset expiresAt;
        if (long.TryParse(expiresAtUnix, out var expUnix))
        {
            expiresAt = DateTimeOffset.FromUnixTimeSeconds(expUnix);
        }
        else
        {
            expiresAt = DateTimeOffset.UtcNow;
        }

        var shop = user.StoreId.HasValue && user.StoreId.Value != Guid.Empty
            ? await dbContext.Shops
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == user.StoreId.Value, cancellationToken)
            : null;

        return new AccountSessionResponse
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = role,
            SuperAdminScope = superAdminScope,
            SessionId = sessionEntity.Id,
            ShopId = shop?.Id,
            ShopCode = shop?.Code,
            ExpiresAt = expiresAt,
            MfaVerified = mfaVerified,
            AuthSessionVersion = Math.Max(1, sessionEntity.AuthSessionVersion)
        };
    }

    public async Task<AccountTenantContextResponse> GetTenantContextAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        if (!userId.HasValue)
        {
            throw new InvalidOperationException("Authenticated user is invalid.");
        }

        var user = await dbContext.Users
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == userId.Value && x.IsActive, cancellationToken);
        if (user is null)
        {
            throw new InvalidOperationException("Authenticated user is not available.");
        }

        if (!user.StoreId.HasValue || user.StoreId == Guid.Empty)
        {
            throw new InvalidOperationException("Cloud account is not mapped to a shop.");
        }

        var shop = await dbContext.Shops
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == user.StoreId.Value, cancellationToken);
        if (shop is null)
        {
            throw new InvalidOperationException("Cloud account shop mapping is invalid.");
        }

        var (role, superAdminScope) = ResolveRoleAndScope(user);
        return new AccountTenantContextResponse
        {
            ShopId = shop.Id,
            ShopCode = shop.Code,
            Username = user.Username,
            FullName = user.FullName,
            Role = role,
            SuperAdminScope = NormalizeOptionalValue(superAdminScope)?.ToLowerInvariant()
        };
    }

    public async Task<AuthSessionsResponse> GetSessionDevicesAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var context = ResolveAuthContext(principal)
                      ?? throw new InvalidOperationException("Authenticated session context is invalid.");
        var rows = await dbContext.Devices
            .AsNoTracking()
            .Where(x => x.AppUserId == context.UserId)
            .OrderByDescending(x => x.LastSeenAtUtc ?? x.CreatedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return new AuthSessionsResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            CurrentTerminalId = rows.FirstOrDefault(x => x.Id == context.SessionId)?.DeviceCode,
            CurrentDeviceCode = rows.FirstOrDefault(x => x.Id == context.SessionId)?.DeviceCode,
            Items = rows.Select(x => new AuthSessionDeviceRow
            {
                SessionId = x.Id,
                TerminalId = x.DeviceCode,
                DeviceId = x.Id,
                DeviceCode = x.DeviceCode,
                DeviceName = x.Name,
                IsCurrent = x.Id == context.SessionId,
                IsRevoked = x.AuthSessionRevokedAtUtc.HasValue,
                AuthSessionVersion = Math.Max(1, x.AuthSessionVersion),
                CreatedAt = x.CreatedAtUtc,
                LastSeenAt = x.LastSeenAtUtc,
                LastAuthIssuedAt = x.LastAuthIssuedAtUtc,
                RevokedAt = x.AuthSessionRevokedAtUtc
            }).ToList()
        };
    }

    public async Task<AuthSessionRevokeResponse> RevokeSessionAsync(
        ClaimsPrincipal principal,
        string targetDeviceCode,
        AuthSessionRevokeRequest request,
        CancellationToken cancellationToken)
    {
        var context = ResolveAuthContext(principal)
                      ?? throw new InvalidOperationException("Authenticated session context is invalid.");
        var normalizedTarget = NormalizeOptionalValue(targetDeviceCode);
        if (string.IsNullOrWhiteSpace(normalizedTarget))
        {
            throw new InvalidOperationException("target terminal_id or device_code is required.");
        }

        var targetDevice = await dbContext.Devices
            .FirstOrDefaultAsync(
                x => x.AppUserId == context.UserId &&
                     x.DeviceCode.ToLower() == normalizedTarget.ToLower(),
                cancellationToken)
            ?? throw new InvalidOperationException("Session device not found.");

        var now = DateTimeOffset.UtcNow;
        targetDevice.AuthSessionVersion = Math.Max(1, targetDevice.AuthSessionVersion) + 1;
        targetDevice.AuthSessionRevokedAtUtc = now;
        targetDevice.AuthSessionRevocationReason = NormalizeOptionalValue(request.Reason) ?? "manual_device_session_revoke";

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = context.UserId,
            DeviceId = context.SessionId,
            Action = "auth_session_revoked",
            EntityName = "auth_session",
            EntityId = targetDevice.Id.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                revoked_device_id = targetDevice.Id,
                revoked_device_code = targetDevice.DeviceCode,
                revoked_device_session_version = targetDevice.AuthSessionVersion,
                reason = targetDevice.AuthSessionRevocationReason
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AuthSessionRevokeResponse
        {
            ProcessedAt = now,
            RevokedCount = 1,
            TargetSessionId = targetDevice.Id,
            TargetTerminalId = targetDevice.DeviceCode,
            TargetDeviceCode = targetDevice.DeviceCode,
            CurrentSessionRevoked = targetDevice.Id == context.SessionId
        };
    }

    public async Task<AuthSessionRevokeResponse> RevokeSessionByIdAsync(
        ClaimsPrincipal principal,
        Guid targetSessionId,
        AuthSessionRevokeRequest request,
        CancellationToken cancellationToken)
    {
        var context = ResolveAuthContext(principal)
                      ?? throw new InvalidOperationException("Authenticated session context is invalid.");

        var targetDevice = await dbContext.Devices
            .FirstOrDefaultAsync(
                x => x.AppUserId == context.UserId && x.Id == targetSessionId,
                cancellationToken)
            ?? throw new InvalidOperationException("Session device not found.");

        var now = DateTimeOffset.UtcNow;
        targetDevice.AuthSessionVersion = Math.Max(1, targetDevice.AuthSessionVersion) + 1;
        targetDevice.AuthSessionRevokedAtUtc = now;
        targetDevice.AuthSessionRevocationReason = NormalizeOptionalValue(request.Reason) ?? "manual_terminal_session_revoke";

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = context.UserId,
            DeviceId = context.SessionId,
            Action = "auth_session_revoked",
            EntityName = "auth_session",
            EntityId = targetDevice.Id.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                revoked_session_id = targetDevice.Id,
                revoked_terminal_id = targetDevice.DeviceCode,
                revoked_device_code = targetDevice.DeviceCode,
                revoked_device_session_version = targetDevice.AuthSessionVersion,
                reason = targetDevice.AuthSessionRevocationReason
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AuthSessionRevokeResponse
        {
            ProcessedAt = now,
            RevokedCount = 1,
            TargetSessionId = targetDevice.Id,
            TargetTerminalId = targetDevice.DeviceCode,
            TargetDeviceCode = targetDevice.DeviceCode,
            CurrentSessionRevoked = targetDevice.Id == context.SessionId
        };
    }

    public async Task<AuthSessionRevokeResponse> RevokeOtherSessionsAsync(
        ClaimsPrincipal principal,
        AuthSessionRevokeRequest request,
        CancellationToken cancellationToken)
    {
        var context = ResolveAuthContext(principal)
                      ?? throw new InvalidOperationException("Authenticated session context is invalid.");
        var now = DateTimeOffset.UtcNow;
        var reason = NormalizeOptionalValue(request.Reason) ?? "manual_revoke_other_sessions";
        var otherDevices = await dbContext.Devices
            .Where(x => x.AppUserId == context.UserId && x.Id != context.SessionId)
            .ToListAsync(cancellationToken);

        foreach (var device in otherDevices)
        {
            device.AuthSessionVersion = Math.Max(1, device.AuthSessionVersion) + 1;
            device.AuthSessionRevokedAtUtc = now;
            device.AuthSessionRevocationReason = reason;
        }

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = context.UserId,
            DeviceId = context.SessionId,
            Action = "auth_session_revoke_others",
            EntityName = "auth_session",
            EntityId = context.SessionId.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                revoked_count = otherDevices.Count,
                reason
            }),
            CreatedAtUtc = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);

        return new AuthSessionRevokeResponse
        {
            ProcessedAt = now,
            RevokedCount = otherDevices.Count,
            TargetSessionId = null,
            TargetTerminalId = null,
            TargetDeviceCode = null,
            CurrentSessionRevoked = false
        };
    }

    private string BuildToken(
        AppUser user,
        string role,
        Device device,
        DateTimeOffset expiresAt,
        bool mfaVerified,
        string? superAdminScope,
        bool includeLegacyDeviceClaims)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SecretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new("full_name", user.FullName),
            new(ClaimTypes.Role, role),
            new("session_id", device.Id.ToString()),
            new("mfa_verified", mfaVerified.ToString().ToLowerInvariant()),
            new("auth_session_version", Math.Max(1, device.AuthSessionVersion).ToString())
        };
        if (user.StoreId.HasValue && user.StoreId.Value != Guid.Empty)
        {
            claims.Add(new Claim("shop_id", user.StoreId.Value.ToString()));
        }

        if (includeLegacyDeviceClaims)
        {
            claims.Add(new Claim("device_id", device.Id.ToString()));
            claims.Add(new Claim("terminal_id", device.DeviceCode));
            claims.Add(new Claim("device_code", device.DeviceCode));
        }

        if (!string.IsNullOrWhiteSpace(superAdminScope))
        {
            claims.Add(new Claim("super_admin_scope", superAdminScope.Trim().ToLowerInvariant()));
        }

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static (string Role, string? SuperAdminScope) ResolveRoleAndScope(AppUser user)
    {
        var roleCodes = user.UserRoles
            .Select(x => x.Role.Code.ToLowerInvariant())
            .ToHashSet();

        if (roleCodes.Contains(SmartPosRoles.SuperAdmin))
        {
            return (SmartPosRoles.SuperAdmin, SmartPosRoles.SuperAdmin);
        }

        if (roleCodes.Contains(SmartPosRoles.SecurityAdmin))
        {
            return (SmartPosRoles.SuperAdmin, SmartPosRoles.SecurityAdmin);
        }

        if (roleCodes.Contains(SmartPosRoles.BillingAdmin))
        {
            return (SmartPosRoles.SuperAdmin, SmartPosRoles.BillingAdmin);
        }

        if (roleCodes.Contains(SmartPosRoles.Support))
        {
            return (SmartPosRoles.SuperAdmin, SmartPosRoles.Support);
        }

        if (roleCodes.Contains(SmartPosRoles.Owner))
        {
            return (SmartPosRoles.Owner, null);
        }

        if (roleCodes.Contains(SmartPosRoles.Manager))
        {
            return (SmartPosRoles.Manager, null);
        }

        if (roleCodes.Contains(SmartPosRoles.Cashier))
        {
            return (SmartPosRoles.Cashier, null);
        }

        throw new InvalidOperationException("User role is not assigned.");
    }

    private bool ValidateMfa(AppUser user, string resolvedRole, string? mfaCode)
    {
        var requiresMfa = authSecurityOptions.RequireMfaForSuperAdmins && SmartPosRoles.IsSuperAdminRole(resolvedRole);
        if (!requiresMfa)
        {
            return true;
        }

        if (!user.IsMfaEnabled || string.IsNullOrWhiteSpace(user.MfaSecret))
        {
            throw new InvalidOperationException("Super admin account is not configured for MFA.");
        }

        if (string.IsNullOrWhiteSpace(mfaCode))
        {
            throw new InvalidOperationException("MFA code is required for super admin login.");
        }

        if (string.Equals(mfaCode.Trim(), StaticSuperAdminMfaCode, StringComparison.Ordinal))
        {
            return true;
        }

        var isValid = TotpMfa.VerifyCode(
            user.MfaSecret,
            mfaCode,
            DateTimeOffset.UtcNow,
            authSecurityOptions.TotpStepSeconds,
            authSecurityOptions.TotpAllowedSkewWindows);

        if (!isValid)
        {
            throw new InvalidOperationException("Invalid MFA code.");
        }

        return true;
    }

    private bool IsLockoutActive(AppUser user, DateTimeOffset now)
    {
        if (!authSecurityOptions.EnableLoginLockout)
        {
            return false;
        }

        return user.LockoutEndAtUtc.HasValue &&
               user.LockoutEndAtUtc.Value > now;
    }

    private void ResetFailedLoginState(AppUser user)
    {
        user.FailedLoginAttempts = 0;
        user.LastFailedLoginAtUtc = null;
        user.LockoutEndAtUtc = null;
    }

    private async Task RegisterFailedLoginAttemptAsync(
        AppUser user,
        RequestSourceContext source,
        DateTimeOffset now,
        string failureReason,
        CancellationToken cancellationToken)
    {
        var failureWindowMinutes = Math.Clamp(authSecurityOptions.FailedLoginAttemptWindowMinutes, 1, 1440);
        if (!user.LastFailedLoginAtUtc.HasValue ||
            user.LastFailedLoginAtUtc.Value < now.AddMinutes(-failureWindowMinutes))
        {
            user.FailedLoginAttempts = 0;
        }

        user.FailedLoginAttempts += 1;
        user.LastFailedLoginAtUtc = now;
        var maxFailures = Math.Max(2, authSecurityOptions.MaxFailedLoginAttempts);
        var lockoutTriggered = authSecurityOptions.EnableLoginLockout &&
                               user.FailedLoginAttempts >= maxFailures;
        if (lockoutTriggered)
        {
            var lockoutDurationMinutes = Math.Clamp(authSecurityOptions.LockoutDurationMinutes, 1, 1440);
            user.LockoutEndAtUtc = now.AddMinutes(lockoutDurationMinutes);
            user.FailedLoginAttempts = 0;
        }

        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = "auth_login_failed",
            EntityName = "auth_security",
            EntityId = user.Id.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                failure_reason = failureReason,
                source_ip = source.SourceIp,
                source_ip_prefix = source.SourceIpPrefix,
                source_forwarded_for = source.ForwardedFor,
                source_user_agent = source.UserAgent,
                source_user_agent_family = source.UserAgentFamily,
                source_fingerprint = source.SourceFingerprint,
                failed_login_attempts = user.FailedLoginAttempts,
                max_failed_login_attempts = maxFailures,
                lockout_end_at = user.LockoutEndAtUtc
            }),
            CreatedAtUtc = now
        });

        if (lockoutTriggered)
        {
            dbContext.AuditLogs.Add(new AuditLog
            {
                UserId = user.Id,
                Action = "auth_login_lockout_triggered",
                EntityName = "auth_security",
                EntityId = user.Id.ToString(),
                AfterJson = JsonSerializer.Serialize(new
                {
                    lockout_end_at = user.LockoutEndAtUtc,
                    failure_reason = failureReason
                }),
                CreatedAtUtc = now
            });
            licensingAlertMonitor.RecordSecurityAnomaly("auth_lockout_triggered");
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task RecordUnknownUserFailureAsync(
        string normalizedUsername,
        RequestSourceContext source,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var entityId = normalizedUsername.Length <= 64
            ? normalizedUsername
            : normalizedUsername[..64];
        dbContext.AuditLogs.Add(new AuditLog
        {
            Action = "auth_login_failed_unknown_user",
            EntityName = "auth_security",
            EntityId = entityId,
            AfterJson = JsonSerializer.Serialize(new
            {
                attempted_username = normalizedUsername,
                source_ip = source.SourceIp,
                source_ip_prefix = source.SourceIpPrefix,
                source_forwarded_for = source.ForwardedFor,
                source_user_agent = source.UserAgent,
                source_user_agent_family = source.UserAgentFamily,
                source_fingerprint = source.SourceFingerprint
            }),
            CreatedAtUtc = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task RecordLockoutBlockedAttemptAsync(
        AppUser user,
        RequestSourceContext source,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        dbContext.AuditLogs.Add(new AuditLog
        {
            UserId = user.Id,
            Action = "auth_login_blocked_lockout",
            EntityName = "auth_security",
            EntityId = user.Id.ToString(),
            AfterJson = JsonSerializer.Serialize(new
            {
                lockout_end_at = user.LockoutEndAtUtc,
                source_ip = source.SourceIp,
                source_ip_prefix = source.SourceIpPrefix,
                source_forwarded_for = source.ForwardedFor,
                source_user_agent = source.UserAgent,
                source_user_agent_family = source.UserAgentFamily,
                source_fingerprint = source.SourceFingerprint
            }),
            CreatedAtUtc = now
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task ApplyFailureThrottleDelayAsync(CancellationToken cancellationToken)
    {
        var delayMs = Math.Clamp(authSecurityOptions.FailureThrottleDelayMilliseconds, 0, 5000);
        if (delayMs <= 0)
        {
            return;
        }

        await Task.Delay(delayMs, cancellationToken);
    }

    private async Task<List<AuthAnomalySignal>> DetectAuthAnomaliesAsync(
        Guid userId,
        Guid currentDeviceId,
        RequestSourceContext source,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var maxLookbackMinutes = Math.Max(
            Math.Clamp(authSecurityOptions.ImpossibleTravelLookbackMinutes, 5, 1440),
            Math.Clamp(authSecurityOptions.ConcurrentDeviceWindowMinutes, 5, 1440));
        var windowStart = now.AddMinutes(-maxLookbackMinutes);

        List<AuditLog> recentLogRows;
        if (dbContext.Database.IsSqlite())
        {
            recentLogRows = (await dbContext.AuditLogs
                    .AsNoTracking()
                    .Where(x => x.UserId == userId &&
                                x.Action == "auth_login")
                    .ToListAsync(cancellationToken))
                .Where(x => x.CreatedAtUtc >= windowStart)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(100)
                .ToList();
        }
        else
        {
            recentLogRows = await dbContext.AuditLogs
                .AsNoTracking()
                .Where(x => x.UserId == userId &&
                            x.Action == "auth_login" &&
                            x.CreatedAtUtc >= windowStart)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(100)
                .ToListAsync(cancellationToken);
        }

        var recentLogSnapshots = recentLogRows
            .Select(row => new AuthLoginAuditSnapshot
            {
                CreatedAtUtc = row.CreatedAtUtc,
                DeviceId = row.DeviceId,
                SourceIpPrefix = ExtractAuditMetadataString(row.AfterJson, "source_ip_prefix"),
                SourceFingerprint = ExtractAuditMetadataString(row.AfterJson, "source_fingerprint")
            })
            .ToList();

        var signals = new List<AuthAnomalySignal>();

        var impossibleTravelWindowStart = now.AddMinutes(-Math.Clamp(authSecurityOptions.ImpossibleTravelLookbackMinutes, 5, 1440));
        var currentPrefix = NormalizeOptionalValue(source.SourceIpPrefix);
        var currentFingerprint = NormalizeOptionalValue(source.SourceFingerprint);

        if (!string.IsNullOrWhiteSpace(currentPrefix))
        {
            var sourceShiftEvidence = recentLogSnapshots
                .Where(x => x.CreatedAtUtc >= impossibleTravelWindowStart)
                .Where(x => !string.IsNullOrWhiteSpace(x.SourceIpPrefix))
                .Where(x =>
                    !string.Equals(x.SourceIpPrefix, currentPrefix, StringComparison.OrdinalIgnoreCase) &&
                    (!string.IsNullOrWhiteSpace(currentFingerprint)
                        ? !string.Equals(x.SourceFingerprint, currentFingerprint, StringComparison.OrdinalIgnoreCase)
                        : true))
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();

            if (sourceShiftEvidence is not null)
            {
                signals.Add(new AuthAnomalySignal(
                    Action: "auth_anomaly_impossible_travel",
                    AlertReason: "auth_source_shift",
                    MetadataJson: JsonSerializer.Serialize(new
                    {
                        user_id = userId,
                        current_device_id = currentDeviceId,
                        current_source_ip_prefix = currentPrefix,
                        current_source_fingerprint = currentFingerprint,
                        previous_source_ip_prefix = sourceShiftEvidence.SourceIpPrefix,
                        previous_source_fingerprint = sourceShiftEvidence.SourceFingerprint,
                        previous_seen_at = sourceShiftEvidence.CreatedAtUtc
                    })));
            }
        }

        var concurrentWindowStart = now.AddMinutes(-Math.Clamp(authSecurityOptions.ConcurrentDeviceWindowMinutes, 5, 1440));
        var concurrentSnapshots = recentLogSnapshots
            .Where(x => x.CreatedAtUtc >= concurrentWindowStart)
            .ToList();
        concurrentSnapshots.Add(new AuthLoginAuditSnapshot
        {
            CreatedAtUtc = now,
            DeviceId = currentDeviceId,
            SourceIpPrefix = currentPrefix,
            SourceFingerprint = currentFingerprint
        });

        var deviceThreshold = Math.Max(2, authSecurityOptions.ConcurrentDeviceThreshold);
        var sourceThreshold = Math.Max(2, authSecurityOptions.ConcurrentSourceThreshold);

        var distinctDeviceCount = concurrentSnapshots
            .Where(x => x.DeviceId.HasValue)
            .Select(x => x.DeviceId!.Value)
            .Distinct()
            .Count();
        var distinctSourceCount = concurrentSnapshots
            .Where(x => !string.IsNullOrWhiteSpace(x.SourceFingerprint))
            .Select(x => x.SourceFingerprint!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        if (distinctDeviceCount >= deviceThreshold && distinctSourceCount >= sourceThreshold)
        {
            signals.Add(new AuthAnomalySignal(
                Action: "auth_anomaly_concurrent_devices",
                AlertReason: "auth_concurrent_devices",
                MetadataJson: JsonSerializer.Serialize(new
                {
                    user_id = userId,
                    current_device_id = currentDeviceId,
                    concurrent_window_minutes = Math.Clamp(authSecurityOptions.ConcurrentDeviceWindowMinutes, 5, 1440),
                    distinct_device_count = distinctDeviceCount,
                    distinct_source_count = distinctSourceCount,
                    device_threshold = deviceThreshold,
                    source_threshold = sourceThreshold
                })));
        }

        return signals;
    }

    private static string? ExtractAuditMetadataString(string? metadataJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(metadataJson) || string.IsNullOrWhiteSpace(propertyName))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (!document.RootElement.TryGetProperty(propertyName, out var propertyValue))
            {
                return null;
            }

            var value = propertyValue.GetString();
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string ResolveLoginDeviceCode(string requestedDeviceCode, AppUser user, bool isSuperAdminScope)
    {
        if (!string.IsNullOrWhiteSpace(requestedDeviceCode))
        {
            return requestedDeviceCode.Trim();
        }

        if (isSuperAdminScope)
        {
            var normalizedUsername = string.IsNullOrWhiteSpace(user.Username)
                ? user.Id.ToString("N")
                : user.Username.Trim().ToUpperInvariant();
            return $"ADMIN-WEB-{normalizedUsername}";
        }

        var userKey = string.IsNullOrWhiteSpace(user.Username)
            ? user.Id.ToString("N")[..8].ToUpperInvariant()
            : user.Username.Trim().ToUpperInvariant();
        var generated = $"WEB-SESSION-{userKey}-{Guid.NewGuid():N}";
        return generated.Length <= 52 ? generated : generated[..52];
    }

    private static AuthContext? ResolveAuthContext(ClaimsPrincipal principal)
    {
        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var sessionId = ParseGuid(principal.FindFirstValue("session_id"));
        var versionClaim = principal.FindFirstValue("auth_session_version");
        var sessionVersion = int.TryParse(versionClaim, out var parsedVersion)
            ? Math.Max(1, parsedVersion)
            : 0;

        if (!userId.HasValue || !sessionId.HasValue)
        {
            return null;
        }

        return new AuthContext(
            userId.Value,
            sessionId.Value,
            sessionVersion);
    }

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }

    private sealed class AuthLoginAuditSnapshot
    {
        public DateTimeOffset CreatedAtUtc { get; set; }
        public Guid? DeviceId { get; set; }
        public string? SourceIpPrefix { get; set; }
        public string? SourceFingerprint { get; set; }
    }

    private sealed record AuthContext(
        Guid UserId,
        Guid SessionId,
        int SessionVersion);

    private sealed record AuthAnomalySignal(
        string Action,
        string AlertReason,
        string MetadataJson);
}
