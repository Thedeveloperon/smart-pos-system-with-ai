using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingFlowTests : IDisposable
{
    private readonly CustomWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public LicensingFlowTests()
    {
        appFactory = new CustomWebApplicationFactory();
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task Activation_Heartbeat_Deactivation_ShouldTransitionStates()
    {
        var deviceCode = $"license-it-{Guid.NewGuid():N}";

        var initialStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={deviceCode}"));
        Assert.Equal("unprovisioned", TestJson.GetString(initialStatus, "state"));

        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "License IT Device",
                actor = "integration-tests",
                reason = "initial activation"
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        var issuedToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(issuedToken));

        var heartbeat = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/license/heartbeat", new
            {
                device_code = deviceCode,
                license_token = issuedToken
            }));

        Assert.Equal("active", TestJson.GetString(heartbeat, "state"));
        var refreshedToken = TestJson.GetString(heartbeat, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(refreshedToken));

        await TestAuth.SignInAsManagerAsync(client);

        var deactivate = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/deactivate", new
            {
                device_code = deviceCode,
                actor = "manager",
                reason = "device retired"
            }));

        Assert.Equal("revoked", TestJson.GetString(deactivate, "state"));

        var finalStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={deviceCode}"));
        Assert.Equal("revoked", TestJson.GetString(finalStatus, "state"));
    }

    [Fact]
    public async Task Activation_WhenSeatLimitReached_ShouldReturnMachineCode()
    {
        var activatedDeviceCodes = new List<string>();

        for (var i = 0; i < 10; i++)
        {
            var deviceCode = $"seat-limit-it-{i}-{Guid.NewGuid():N}";
            var response = await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Seat Limit Device"
            });

            if (response.IsSuccessStatusCode)
            {
                activatedDeviceCodes.Add(deviceCode);
                continue;
            }

            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var payload = await ReadJsonAsync(response);
            Assert.Equal(
                "SEAT_LIMIT_EXCEEDED",
                payload["error"]?["code"]?.GetValue<string>());
            await RevokeDevicesAsync(activatedDeviceCodes);
            return;
        }

        await RevokeDevicesAsync(activatedDeviceCodes);
        throw new InvalidOperationException("Expected SEAT_LIMIT_EXCEEDED but all activations succeeded.");
    }

    [Fact]
    public async Task ProtectedRoute_WithUnprovisionedDevice_ShouldBeBlockedByMiddleware()
    {
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = $"unprovisioned-it-{Guid.NewGuid():N}",
            device_name = "Unprovisioned Device"
        });

        loginResponse.EnsureSuccessStatusCode();

        var blockedResponse = await client.GetAsync("/api/checkout/held");
        Assert.Equal(HttpStatusCode.Forbidden, blockedResponse.StatusCode);

        var payload = await ReadJsonAsync(blockedResponse);
        Assert.Equal("UNPROVISIONED", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ReportsRoute_WithUnprovisionedSuperAdminDevice_ShouldBypassLicenseEnforcement()
    {
        var deviceCode = $"support-unprovisioned-it-{Guid.NewGuid():N}";
        var now = DateTimeOffset.UtcNow;
        var mfaCounter = now.ToUnixTimeSeconds() / 30;
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "support_admin",
            password = "support123",
            device_code = deviceCode,
            device_name = "Support Unprovisioned Device",
            mfa_code = TotpMfa.GenerateCode("support-admin-mfa-secret-2026", mfaCounter)
        });
        loginResponse.EnsureSuccessStatusCode();

        var reportsResponse = await client.GetAsync("/api/reports/transactions?from=2026-03-26&to=2026-04-01&take=50");
        reportsResponse.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Activation_ShouldIssueOfflineGrant_AndAllowCookieBasedTokenReuse()
    {
        var deviceCode = $"license-cookie-it-{Guid.NewGuid():N}";

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Cookie Token Device",
            actor = "integration-tests",
            reason = "cookie fallback validation"
        });
        activationResponse.EnsureSuccessStatusCode();

        var activationPayload = await TestJson.ReadObjectAsync(activationResponse);
        Assert.Equal("active", TestJson.GetString(activationPayload, "state"));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(activationPayload, "license_token")));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(activationPayload, "offline_grant_token")));

        var offlineGrantExpiryRaw = TestJson.GetString(activationPayload, "offline_grant_expires_at");
        Assert.True(DateTimeOffset.TryParse(offlineGrantExpiryRaw, out var offlineGrantExpiry));
        Assert.InRange(
            offlineGrantExpiry,
            DateTimeOffset.UtcNow.AddHours(23),
            DateTimeOffset.UtcNow.AddHours(73));

        var hasLicenseCookie = activationResponse.Headers.TryGetValues("Set-Cookie", out var setCookieValues) &&
                               setCookieValues.Any(value =>
                                   value.Contains("smartpos_license=", StringComparison.OrdinalIgnoreCase));
        Assert.True(hasLicenseCookie);

        var heartbeatResponse = await client.PostAsJsonAsync("/api/license/heartbeat", new
        {
            device_code = deviceCode
        });
        heartbeatResponse.EnsureSuccessStatusCode();

        var heartbeatPayload = await TestJson.ReadObjectAsync(heartbeatResponse);
        Assert.Equal("active", TestJson.GetString(heartbeatPayload, "state"));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(heartbeatPayload, "license_token")));
    }

    [Fact]
    public async Task AdminRevokeAndReactivate_ShouldRoundTripDeviceState()
    {
        var deviceCode = $"admin-revoke-reactivate-it-{Guid.NewGuid():N}";

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Admin Revocation Test Device",
            actor = "integration-tests",
            reason = "admin revoke/reactivate setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var revokeResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/revoke",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_revoke",
                actor_note = "manual qa revoke validation",
                reason = "manual qa revoke validation"
            });
        revokeResponse.EnsureSuccessStatusCode();

        var revoked = await TestJson.ReadObjectAsync(revokeResponse);
        Assert.Equal("revoke", TestJson.GetString(revoked, "action"));
        Assert.Equal("revoked", TestJson.GetString(revoked, "status"));
        Assert.Equal("revoked", TestJson.GetString(revoked, "license_state"));

        var reactivationResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/reactivate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_reactivate",
                actor_note = "manual qa reactivate validation",
                reason = "manual qa reactivate validation"
            });
        reactivationResponse.EnsureSuccessStatusCode();

        var reactivated = await TestJson.ReadObjectAsync(reactivationResponse);
        Assert.Equal("reactivate", TestJson.GetString(reactivated, "action"));
        Assert.Equal("active", TestJson.GetString(reactivated, "status"));
        Assert.Equal("active", TestJson.GetString(reactivated, "license_state"));

        var finalStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={deviceCode}"));
        Assert.Equal("active", TestJson.GetString(finalStatus, "state"));
    }

    [Fact]
    public async Task AdminDeactivateAndActivate_ShouldRoundTripDeviceState()
    {
        var deviceCode = $"admin-deactivate-activate-it-{Guid.NewGuid():N}";

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Admin Deactivate Test Device",
            actor = "integration-tests",
            reason = "admin deactivate/activate setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var deactivateResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/deactivate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_deactivate",
                actor_note = "manual deactivate validation",
                reason = "manual deactivate validation"
            });
        deactivateResponse.EnsureSuccessStatusCode();

        var deactivated = await TestJson.ReadObjectAsync(deactivateResponse);
        Assert.Equal("deactivate", TestJson.GetString(deactivated, "action"));
        Assert.Equal("revoked", TestJson.GetString(deactivated, "status"));
        Assert.Equal("revoked", TestJson.GetString(deactivated, "license_state"));

        var activateResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/activate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_activate",
                actor_note = "manual activate validation",
                reason = "manual activate validation"
            });
        activateResponse.EnsureSuccessStatusCode();

        var activated = await TestJson.ReadObjectAsync(activateResponse);
        Assert.Equal("activate", TestJson.GetString(activated, "action"));
        Assert.Equal("active", TestJson.GetString(activated, "status"));
        Assert.Equal("active", TestJson.GetString(activated, "license_state"));
    }

    [Fact]
    public async Task AdminDeactivate_ShouldRequireReasonCode()
    {
        var deviceCode = $"admin-reason-code-required-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Admin Reason Code Device",
            actor = "integration-tests",
            reason = "reason code setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/deactivate",
            new
            {
                actor = "support_admin",
                reason = "legacy reason without code"
            });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await ReadJsonAsync(response);
        Assert.Equal("INVALID_ADMIN_REQUEST", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task AdminTransferSeat_ShouldMoveDeviceToTargetShop()
    {
        var deviceCode = $"admin-transfer-seat-it-{Guid.NewGuid():N}";
        var targetShopCode = $"transfer-target-{Guid.NewGuid():N}";

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Seat Transfer Device",
            actor = "integration-tests",
            reason = "seat transfer setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var transferResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/transfer-seat",
            new
            {
                target_shop_code = targetShopCode,
                actor = "support_admin",
                reason_code = "manual_transfer_seat",
                actor_note = "customer moved to another branch",
                reason = "customer moved to another branch"
            });
        transferResponse.EnsureSuccessStatusCode();

        var transfer = await TestJson.ReadObjectAsync(transferResponse);
        Assert.Equal("transfer_seat", TestJson.GetString(transfer, "action"));
        Assert.Equal("active", TestJson.GetString(transfer, "status"));
        Assert.Equal("active", TestJson.GetString(transfer, "license_state"));
        Assert.Equal(targetShopCode, TestJson.GetString(transfer, "target_shop_code"));

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == deviceCode);
        var targetShop = await dbContext.Shops
            .AsNoTracking()
            .SingleAsync(x => x.Code == targetShopCode);

        Assert.Equal(targetShop.Id, provisionedDevice.ShopId);
    }

    [Fact]
    public async Task AdminTransferSeat_ShouldRequireSuperAdminRole()
    {
        var deviceCode = $"admin-transfer-seat-policy-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Seat Transfer Policy Device",
            actor = "integration-tests",
            reason = "policy setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/transfer-seat",
            new
            {
                target_shop_code = $"transfer-policy-target-{Guid.NewGuid():N}",
                actor = "manager",
                reason_code = "manual_transfer_seat",
                actor_note = "manager should not transfer",
                reason = "manager should not transfer"
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminExtendGrace_HighRiskShouldRequireStepUpApproval()
    {
        var deviceCode = $"admin-extend-grace-stepup-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Grace StepUp Device",
            actor = "integration-tests",
            reason = "grace setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var withoutStepUp = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/extend-grace",
            new
            {
                actor = "support_admin",
                reason_code = "manual_extend_grace",
                actor_note = "long grace extension without approval",
                extend_days = 10
            });
        Assert.Equal(HttpStatusCode.Conflict, withoutStepUp.StatusCode);
        var withoutStepUpPayload = await ReadJsonAsync(withoutStepUp);
        Assert.Equal("SECOND_APPROVAL_REQUIRED", withoutStepUpPayload["error"]?["code"]?.GetValue<string>());

        var withStepUp = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/extend-grace",
            new
            {
                actor = "support_admin",
                reason_code = "manual_extend_grace",
                actor_note = "approved long grace extension",
                extend_days = 10,
                step_up_approved_by = "security_admin",
                step_up_approval_note = "fraud triage approved"
            });
        withStepUp.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task AdminMassRevoke_ShouldRequireStepUp_ThenRevokeDevices()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var additionalDeviceCodes = Enumerable.Range(1, 2)
            .Select(index => $"admin-mass-revoke-{index}-{Guid.NewGuid():N}")
            .ToList();
        foreach (var code in additionalDeviceCodes)
        {
            var activation = await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = code,
                device_name = "Mass Revoke Device",
                actor = "integration-tests",
                reason = "mass revoke setup"
            });
            activation.EnsureSuccessStatusCode();
        }

        var deviceCodes = new List<string> { "integration-tests-device" };
        deviceCodes.AddRange(additionalDeviceCodes);

        var withoutStepUp = await client.PostAsJsonAsync("/api/admin/licensing/devices/mass-revoke", new
        {
            device_codes = deviceCodes,
            actor = "support_admin",
            reason_code = "manual_mass_revoke",
            actor_note = "bulk revoke without approval"
        });
        Assert.Equal(HttpStatusCode.Conflict, withoutStepUp.StatusCode);
        var withoutStepUpPayload = await ReadJsonAsync(withoutStepUp);
        Assert.Equal("SECOND_APPROVAL_REQUIRED", withoutStepUpPayload["error"]?["code"]?.GetValue<string>());

        var withStepUp = await client.PostAsJsonAsync("/api/admin/licensing/devices/mass-revoke", new
        {
            device_codes = deviceCodes,
            actor = "support_admin",
            reason_code = "manual_mass_revoke",
            actor_note = "approved bulk revoke",
            step_up_approved_by = "security_admin",
            step_up_approval_note = "customer offboarding approved"
        });
        withStepUp.EnsureSuccessStatusCode();
        var payload = await TestJson.ReadObjectAsync(withStepUp);
        Assert.Equal("mass_revoke", TestJson.GetString(payload, "action"));
        Assert.Equal(deviceCodes.Count, payload["requested_count"]?.GetValue<int>());
        Assert.Equal(deviceCodes.Count, payload["revoked_count"]?.GetValue<int>());
    }

    [Fact]
    public async Task AdminEmergencyEnvelope_LockDevice_ShouldExecuteAndRejectReplay()
    {
        var deviceCode = $"admin-emergency-lock-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Emergency Lock Device",
            actor = "integration-tests",
            reason = "emergency lock setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var envelopeResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/emergency/envelope",
            new
            {
                action = "lock_device",
                actor = "support_admin",
                reason_code = "emergency_lock_device",
                actor_note = "suspicious behavior detected"
            });
        envelopeResponse.EnsureSuccessStatusCode();
        var envelope = await TestJson.ReadObjectAsync(envelopeResponse);
        var envelopeToken = TestJson.GetString(envelope, "envelope_token");
        Assert.False(string.IsNullOrWhiteSpace(envelopeToken));

        var executeResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/emergency/execute",
            new
            {
                envelope_token = envelopeToken
            });
        executeResponse.EnsureSuccessStatusCode();
        var executePayload = await TestJson.ReadObjectAsync(executeResponse);
        Assert.Equal("lock_device", TestJson.GetString(executePayload, "action"));
        Assert.Equal("completed", TestJson.GetString(executePayload, "status"));

        var replay = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/emergency/execute",
            new
            {
                envelope_token = envelopeToken
            });
        Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
        var replayPayload = await ReadJsonAsync(replay);
        Assert.Equal("CHALLENGE_CONSUMED", replayPayload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task AdminEmergencyEnvelope_ShouldRequireSupportOrSecurityScope()
    {
        var deviceCode = $"admin-emergency-policy-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Emergency Policy Device",
            actor = "integration-tests",
            reason = "emergency policy setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsBillingAdminAsync(client);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/emergency/envelope",
            new
            {
                action = "revoke_token",
                actor = "billing_admin",
                reason_code = "emergency_revoke_token",
                actor_note = "billing admin should be denied"
            });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminAuditLogsExport_ShouldReturnCsv()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var response = await client.GetAsync("/api/admin/licensing/audit-logs/export?format=csv&take=10");
        response.EnsureSuccessStatusCode();
        Assert.Contains("text/csv", response.Content.Headers.ContentType?.MediaType, StringComparison.OrdinalIgnoreCase);

        var csv = await response.Content.ReadAsStringAsync();
        Assert.Contains("id,timestamp,shop_id,device_id,action,actor,reason", csv, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ManualOverrideAuditHashes_ShouldBuildImmutableChain()
    {
        var deviceCode = $"admin-audit-chain-it-{Guid.NewGuid():N}";
        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Audit Chain Device",
            actor = "integration-tests",
            reason = "audit chain setup"
        });
        activationResponse.EnsureSuccessStatusCode();

        await TestAuth.SignInAsSupportAdminAsync(client);

        var deactivate = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/deactivate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_deactivate",
                actor_note = "audit chain deactivate"
            });
        deactivate.EnsureSuccessStatusCode();

        var activate = await client.PostAsJsonAsync(
            $"/api/admin/licensing/devices/{Uri.EscapeDataString(deviceCode)}/activate",
            new
            {
                actor = "support_admin",
                reason_code = "manual_device_activate",
                actor_note = "audit chain activate"
            });
        activate.EnsureSuccessStatusCode();

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var device = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .SingleAsync(x => x.DeviceCode == deviceCode);
        var manualOverrideLogs = (await dbContext.LicenseAuditLogs
                .AsNoTracking()
                .Where(x => x.ShopId == device.ShopId && x.ProvisionedDeviceId == device.Id && x.IsManualOverride)
                .ToListAsync())
            .OrderBy(x => x.CreatedAtUtc)
            .ToList();

        Assert.True(manualOverrideLogs.Count >= 2);
        Assert.All(manualOverrideLogs, log => Assert.False(string.IsNullOrWhiteSpace(log.ImmutableHash)));

        for (var index = 1; index < manualOverrideLogs.Count; index++)
        {
            Assert.Equal(manualOverrideLogs[index - 1].ImmutableHash, manualOverrideLogs[index].ImmutablePreviousHash);
        }
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }

    private async Task RevokeDevicesAsync(IEnumerable<string> deviceCodes)
    {
        var codes = deviceCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (codes.Count == 0)
        {
            return;
        }

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var devices = await dbContext.ProvisionedDevices
            .Where(x => codes.Contains(x.DeviceCode))
            .ToListAsync();
        if (devices.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var device in devices)
        {
            device.Status = ProvisionedDeviceStatus.Revoked;
            device.RevokedAtUtc = now;
            device.LastHeartbeatAtUtc = now;
        }

        var deviceIds = devices.Select(x => x.Id).ToList();
        var activeLicenses = await dbContext.Licenses
            .Where(x => deviceIds.Contains(x.ProvisionedDeviceId) && x.Status == LicenseRecordStatus.Active)
            .ToListAsync();
        foreach (var license in activeLicenses)
        {
            license.Status = LicenseRecordStatus.Revoked;
            license.RevokedAtUtc = now;
        }

        await dbContext.SaveChangesAsync();
    }
}
