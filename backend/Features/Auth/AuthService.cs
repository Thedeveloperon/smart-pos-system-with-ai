using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Auth;

public sealed class AuthService(
    SmartPosDbContext dbContext,
    JwtCookieOptions jwtOptions,
    IOptions<AuthSecurityOptions> authSecurityOptionsAccessor)
{
    private readonly AuthSecurityOptions authSecurityOptions = authSecurityOptionsAccessor.Value;

    public async Task<(string Token, AuthSessionResponse Session)> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var username = request.Username?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var deviceCode = request.DeviceCode?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Username and password are required.");
        }

        if (string.IsNullOrWhiteSpace(deviceCode))
        {
            throw new InvalidOperationException("device_code is required.");
        }

        var normalizedUsername = username.ToLowerInvariant();
        var user = await dbContext.Users
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(
                x => x.IsActive && x.Username.ToLower() == normalizedUsername,
                cancellationToken)
            ?? throw new InvalidOperationException("Invalid username or password.");

        if (!PasswordHashing.VerifyPassword(user, user.PasswordHash, password))
        {
            throw new InvalidOperationException("Invalid username or password.");
        }

        var (role, superAdminScope) = ResolveRoleAndScope(user);
        var mfaVerified = ValidateMfa(user, role, request.MfaCode);
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(Math.Max(15, jwtOptions.ExpiryMinutes));

        var device = await dbContext.Devices
            .FirstOrDefaultAsync(x => x.DeviceCode == deviceCode, cancellationToken);

        if (device is null)
        {
            device = new Device
            {
                AppUserId = user.Id,
                DeviceCode = deviceCode,
                Name = string.IsNullOrWhiteSpace(request.DeviceName)
                    ? "POS Browser"
                    : request.DeviceName.Trim(),
                IsTrusted = true,
                CreatedAtUtc = now,
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
            device.LastSeenAtUtc = now;
        }

        user.LastLoginAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);

        var token = BuildToken(user, role, device, expiresAt, mfaVerified, superAdminScope);
        var session = new AuthSessionResponse
        {
            UserId = user.Id,
            Username = user.Username,
            FullName = user.FullName,
            Role = role,
            DeviceId = device.Id,
            DeviceCode = device.DeviceCode,
            ExpiresAt = expiresAt,
            MfaVerified = mfaVerified
        };

        return (token, session);
    }

    public async Task<AuthSessionResponse?> GetCurrentSessionAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var deviceId = ParseGuid(principal.FindFirstValue("device_id"));
        var role = principal.FindFirstValue(ClaimTypes.Role);
        var expiresAtUnix = principal.FindFirstValue(JwtRegisteredClaimNames.Exp);
        var mfaVerifiedClaim = principal.FindFirstValue("mfa_verified");
        var mfaVerified = bool.TryParse(mfaVerifiedClaim, out var parsedMfaVerified) && parsedMfaVerified;

        if (!userId.HasValue || !deviceId.HasValue || string.IsNullOrWhiteSpace(role))
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
            .FirstOrDefaultAsync(x => x.Id == deviceId.Value && x.AppUserId == user.Id, cancellationToken);
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
            DeviceId = device.Id,
            DeviceCode = device.DeviceCode,
            ExpiresAt = expiresAt,
            MfaVerified = mfaVerified
        };
    }

    private string BuildToken(
        AppUser user,
        string role,
        Device device,
        DateTimeOffset expiresAt,
        bool mfaVerified,
        string? superAdminScope)
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
            new("device_id", device.Id.ToString()),
            new("device_code", device.DeviceCode),
            new("mfa_verified", mfaVerified.ToString().ToLowerInvariant())
        };
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

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }
}
