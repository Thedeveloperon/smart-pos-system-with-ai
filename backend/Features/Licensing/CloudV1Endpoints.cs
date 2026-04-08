using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Licensing;

public static class CloudV1Endpoints
{
    public static IEndpointRouteBuilder MapCloudV1Endpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/cloud/v1")
            .WithTags("Cloud v1");

        group.MapGet("/health", () => Results.Ok(new
        {
            status = "ok",
            api_version = "v1",
            service = "smartpos-cloud-contract",
            timestamp = DateTimeOffset.UtcNow
        }))
        .AllowAnonymous()
        .WithName("CloudV1Health")
        .WithOpenApi();

        group.MapGet("/meta/version-policy", (
            IOptions<CloudApiCompatibilityOptions> optionsAccessor) =>
        {
            var options = optionsAccessor.Value;
            var channels = options.ReleaseChannels
                .Select(channel => new
                {
                    channel = NormalizeReleaseChannel(channel.Channel),
                    latest_pos_version = NormalizeVersion(channel.LatestPosVersion),
                    minimum_supported_pos_version = NormalizeVersion(channel.MinimumSupportedPosVersion),
                    has_installer_url = !string.IsNullOrWhiteSpace(channel.InstallerDownloadUrl),
                    has_checksum = !string.IsNullOrWhiteSpace(channel.InstallerChecksumSha256),
                    has_signature = !string.IsNullOrWhiteSpace(channel.InstallerSignatureSha256),
                    published_at = NormalizeOptionalValue(channel.PublishedAtUtc),
                    rollback_target_version = NormalizeOptionalValue(channel.RollbackTargetVersion)
                })
                .ToList();
            return Results.Ok(new
            {
                api_version = options.ApiVersion,
                enforce_minimum_supported_pos_version = options.EnforceMinimumSupportedPosVersion,
                minimum_supported_pos_version = options.MinimumSupportedPosVersion,
                latest_pos_version = options.LatestPosVersion,
                default_release_channel = NormalizeReleaseChannel(options.DefaultReleaseChannel),
                require_installer_checksum_in_release_metadata = options.RequireInstallerChecksumInReleaseMetadata,
                require_installer_signature_in_release_metadata = options.RequireInstallerSignatureInReleaseMetadata,
                allow_rollback_to_previous_stable = options.AllowRollbackToPreviousStable,
                minimum_rollback_target_version = NormalizeOptionalValue(options.MinimumRollbackTargetVersion),
                legacy_api_deprecation_enabled = options.LegacyApiDeprecationEnabled,
                legacy_api_deprecation_date_utc = options.LegacyApiDeprecationDateUtc,
                legacy_api_sunset_date_utc = options.LegacyApiSunsetDateUtc,
                legacy_api_migration_guide_url = options.LegacyApiMigrationGuideUrl,
                required_write_headers = options.RequiredWriteHeaders,
                release_channels = channels,
                generated_at = DateTimeOffset.UtcNow
            });
        })
        .AllowAnonymous()
        .WithName("CloudV1GetVersionPolicy")
        .WithOpenApi();

        group.MapGet("/meta/contracts", () =>
        {
            return Results.Ok(new
            {
                api_version = "v1",
                write_contract = new
                {
                    required_headers = new[]
                    {
                        CloudWriteRequestContract.IdempotencyHeaderName,
                        CloudWriteRequestContract.DeviceIdHeaderName,
                        CloudWriteRequestContract.PosVersionHeaderName
                    }
                },
                surfaces = new[]
                {
                    "/cloud/v1/device/challenge",
                    "/cloud/v1/device/activate",
                    "/cloud/v1/device/deactivate",
                    "/cloud/v1/license/status",
                    "/cloud/v1/license/heartbeat",
                    "/cloud/v1/license/feature-check",
                    "/cloud/v1/releases/latest",
                    "/cloud/v1/releases/min-supported",
                    "/cloud/v1/meta/ai-privacy-policy",
                    "/cloud/v1/meta/version-policy",
                    "/api/provision/challenge",
                    "/api/provision/activate",
                    "/api/provision/deactivate",
                    "/api/license/status",
                    "/api/license/heartbeat",
                    "/api/license/account/licenses",
                    "/api/ai/insights",
                    "/api/ai/chat/sessions",
                    "/api/admin/recovery/status",
                    "/api/reports/support-triage",
                    "/api/reports/support-alert-catalog"
                },
                generated_at = DateTimeOffset.UtcNow
            });
        })
        .AllowAnonymous()
        .WithName("CloudV1GetContractSurface")
        .WithOpenApi();

        group.MapGet("/meta/ai-privacy-policy", (
            IOptions<AiInsightOptions> aiInsightOptions,
            AiPrivacyGovernanceService aiPrivacyGovernanceService) =>
        {
            var insightOptions = aiInsightOptions.Value;
            var policy = aiPrivacyGovernanceService.GetPolicySnapshot();
            return Results.Ok(new
            {
                api_version = "v1",
                payload_redaction_enabled = policy.PayloadRedactionEnabled,
                redaction_placeholder = policy.RedactionPlaceholder,
                provider_payload_allowlist = policy.ProviderPayloadAllowlist,
                redaction_rules = policy.RedactionRules.Select(x => new
                {
                    name = x.Name,
                    enabled = x.Enabled
                }),
                retention = new
                {
                    enabled = policy.RetentionEnabled,
                    chat_messages_days = policy.ChatMessageRetentionDays,
                    conversations_days = policy.ConversationRetentionDays,
                    insights_succeeded_days = policy.InsightSucceededRetentionDays,
                    insights_failed_days = policy.InsightFailedRetentionDays
                },
                provider_key_source = new
                {
                    environment_variable = string.IsNullOrWhiteSpace(insightOptions.OpenAiApiKeyEnvironmentVariable)
                        ? "OPENAI_API_KEY"
                        : insightOptions.OpenAiApiKeyEnvironmentVariable.Trim(),
                    cloud_only = true
                },
                generated_at = DateTimeOffset.UtcNow
            });
        })
        .AllowAnonymous()
        .WithName("CloudV1GetAiPrivacyPolicy")
        .WithOpenApi();

        group.MapGet("/releases/latest", (
            string? channel,
            IOptions<CloudApiCompatibilityOptions> optionsAccessor) =>
        {
            var options = optionsAccessor.Value;
            if (!TryResolveReleaseChannel(options, channel, out var resolvedChannel, out var release))
            {
                return ToErrorResult(new LicenseException(
                    "RELEASE_CHANNEL_NOT_FOUND",
                    $"Release channel '{NormalizeReleaseChannel(channel)}' is not configured.",
                    StatusCodes.Status404NotFound));
            }

            var trustValidation = ValidateReleaseChannelTrust(options, release);
            if (!trustValidation.IsValid)
            {
                return ToErrorResult(new LicenseException(
                    "RELEASE_TRUST_METADATA_INCOMPLETE",
                    $"Release channel '{resolvedChannel}' is missing trust metadata: {string.Join(", ", trustValidation.MissingFields)}.",
                    StatusCodes.Status503ServiceUnavailable));
            }

            return Results.Ok(new
            {
                channel = resolvedChannel,
                latest_pos_version = NormalizeVersion(release.LatestPosVersion),
                minimum_supported_pos_version = NormalizeVersion(release.MinimumSupportedPosVersion),
                installer_download_url = NormalizeOptionalValue(release.InstallerDownloadUrl),
                installer_checksum_sha256 = NormalizeOptionalValue(release.InstallerChecksumSha256),
                installer_signature_sha256 = NormalizeOptionalValue(release.InstallerSignatureSha256),
                installer_signature_algorithm = NormalizeOptionalValue(release.InstallerSignatureAlgorithm) ?? "sha256-rsa",
                release_notes_url = NormalizeOptionalValue(release.ReleaseNotesUrl),
                published_at = NormalizeOptionalValue(release.PublishedAtUtc),
                rollback_target_version = NormalizeOptionalValue(release.RollbackTargetVersion),
                trust_chain = new
                {
                    required_checksum = options.RequireInstallerChecksumInReleaseMetadata,
                    required_signature = options.RequireInstallerSignatureInReleaseMetadata,
                    checksum_present = !string.IsNullOrWhiteSpace(release.InstallerChecksumSha256),
                    signature_present = !string.IsNullOrWhiteSpace(release.InstallerSignatureSha256),
                    metadata_complete = trustValidation.IsValid
                },
                generated_at = DateTimeOffset.UtcNow
            });
        })
        .AllowAnonymous()
        .WithName("CloudV1GetLatestRelease")
        .WithOpenApi();

        group.MapGet("/releases/min-supported", (
            string? channel,
            IOptions<CloudApiCompatibilityOptions> optionsAccessor) =>
        {
            var options = optionsAccessor.Value;
            if (!TryResolveReleaseChannel(options, channel, out var resolvedChannel, out var release))
            {
                return ToErrorResult(new LicenseException(
                    "RELEASE_CHANNEL_NOT_FOUND",
                    $"Release channel '{NormalizeReleaseChannel(channel)}' is not configured.",
                    StatusCodes.Status404NotFound));
            }

            var rollbackValidation = ValidateRollbackPolicy(options, release);
            return Results.Ok(new
            {
                channel = resolvedChannel,
                minimum_supported_pos_version = NormalizeVersion(release.MinimumSupportedPosVersion),
                latest_pos_version = NormalizeVersion(release.LatestPosVersion),
                allow_rollback_to_previous_stable = options.AllowRollbackToPreviousStable,
                rollback_target_version = NormalizeOptionalValue(release.RollbackTargetVersion),
                minimum_rollback_target_version = NormalizeOptionalValue(options.MinimumRollbackTargetVersion),
                rollback_policy_valid = rollbackValidation.IsValid,
                rollback_policy_warning = rollbackValidation.Warning,
                generated_at = DateTimeOffset.UtcNow
            });
        })
        .AllowAnonymous()
        .WithName("CloudV1GetMinSupportedRelease")
        .WithOpenApi();

        var device = group.MapGroup("/device");

        device.MapPost("/challenge", async (
            ProvisionChallengeRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                var response = await licenseService.CreateActivationChallengeAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CloudV1CreateProvisionChallenge")
        .WithOpenApi();

        device.MapPost("/activate", async (
            ProvisionActivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                var response = await licenseService.ActivateAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CloudV1ActivateProvision")
        .WithOpenApi();

        device.MapPost("/deactivate", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            ProvisionDeactivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                var response = await licenseService.DeactivateAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("CloudV1DeactivateProvision")
        .WithOpenApi();

        var license = group.MapGroup("/license");

        license.MapGet("/status", async (
            string? device_code,
            HttpContext httpContext,
            LicenseService licenseService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var deviceCode = licenseService.ResolveDeviceCode(device_code, httpContext);
                var token = string.IsNullOrWhiteSpace(device_code)
                    ? licenseService.ResolveLicenseToken(httpContext)
                    : licenseService.ResolveLicenseToken(httpContext, includeCookie: false);
                var response = await licenseService.GetStatusAsync(deviceCode, token, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch or LicenseErrorCodes.TokenReplayDetected)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CloudV1GetLicenseStatus")
        .WithOpenApi();

        license.MapPost("/heartbeat", async (
            LicenseHeartbeatRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            LicensingMetrics licensingMetrics,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            if (string.IsNullOrWhiteSpace(request.LicenseToken))
            {
                request.LicenseToken = licenseService.ResolveLicenseToken(httpContext);
            }

            try
            {
                var response = await licenseService.HeartbeatAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                licensingMetrics.RecordHeartbeatFailure(ex.Code);
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch or LicenseErrorCodes.TokenReplayDetected)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CloudV1LicenseHeartbeat")
        .WithOpenApi();

        license.MapGet("/feature-check", async (
            string feature,
            string? device_code,
            HttpContext httpContext,
            LicenseService licenseService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(feature))
            {
                return ToErrorResult(new LicenseException(
                    "INVALID_FEATURE_CHECK_REQUEST",
                    "feature is required.",
                    StatusCodes.Status400BadRequest));
            }

            try
            {
                var deviceCode = licenseService.ResolveDeviceCode(device_code, httpContext);
                var token = string.IsNullOrWhiteSpace(device_code)
                    ? licenseService.ResolveLicenseToken(httpContext)
                    : licenseService.ResolveLicenseToken(httpContext, includeCookie: false);
                var response = await licenseService.GetStatusAsync(deviceCode, token, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);

                var normalizedFeature = feature.Trim().ToLowerInvariant();
                var blockedActions = response.BlockedActions ?? [];
                var state = (response.State ?? string.Empty).Trim().ToLowerInvariant();
                var blocked = blockedActions.Any(entry => string.Equals(entry, normalizedFeature, StringComparison.OrdinalIgnoreCase));
                var stateAllowsProtectedFeatures = state is "active" or "grace";
                var allowed = stateAllowsProtectedFeatures && !blocked;
                var denialReason = allowed
                    ? null
                    : !stateAllowsProtectedFeatures
                        ? $"license_state_{state}"
                        : "feature_blocked";

                return Results.Ok(new
                {
                    feature = normalizedFeature,
                    allowed,
                    denial_reason = denialReason,
                    license_state = response.State,
                    blocked_actions = blockedActions,
                    valid_until = response.ValidUntil,
                    evaluated_at = DateTimeOffset.UtcNow
                });
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch or LicenseErrorCodes.TokenReplayDetected)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CloudV1LicenseFeatureCheck")
        .WithOpenApi();

        return app;
    }

    private static IResult ToErrorResult(LicenseException exception)
    {
        return Results.Json(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = exception.Code,
                Message = exception.Message
            }
        }, statusCode: exception.StatusCode);
    }

    private static void SyncLicenseTokenCookie(
        HttpContext httpContext,
        LicenseService licenseService,
        LicenseStatusResponse response)
    {
        licenseService.WriteLicenseTokenCookie(httpContext, response.LicenseToken, response.ValidUntil);
    }

    private static bool TryResolveReleaseChannel(
        CloudApiCompatibilityOptions options,
        string? requestedChannel,
        out string resolvedChannel,
        out CloudApiReleaseChannelOptions release)
    {
        var normalizedRequested = NormalizeReleaseChannel(requestedChannel);
        var fallbackChannel = NormalizeReleaseChannel(options.DefaultReleaseChannel);
        var resolvedChannelValue = string.IsNullOrWhiteSpace(normalizedRequested)
            ? fallbackChannel
            : normalizedRequested;

        var matched = options.ReleaseChannels
            .FirstOrDefault(x => string.Equals(
                NormalizeReleaseChannel(x.Channel),
                resolvedChannelValue,
                StringComparison.OrdinalIgnoreCase));
        if (matched is null)
        {
            resolvedChannel = resolvedChannelValue;
            release = new CloudApiReleaseChannelOptions();
            return false;
        }

        resolvedChannel = resolvedChannelValue;
        release = matched;
        return true;
    }

    private static (bool IsValid, List<string> MissingFields) ValidateReleaseChannelTrust(
        CloudApiCompatibilityOptions options,
        CloudApiReleaseChannelOptions release)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(release.InstallerDownloadUrl))
        {
            missing.Add("installer_download_url");
        }

        if (options.RequireInstallerChecksumInReleaseMetadata &&
            string.IsNullOrWhiteSpace(release.InstallerChecksumSha256))
        {
            missing.Add("installer_checksum_sha256");
        }

        if (options.RequireInstallerSignatureInReleaseMetadata &&
            string.IsNullOrWhiteSpace(release.InstallerSignatureSha256))
        {
            missing.Add("installer_signature_sha256");
        }

        return (missing.Count == 0, missing);
    }

    private static (bool IsValid, string? Warning) ValidateRollbackPolicy(
        CloudApiCompatibilityOptions options,
        CloudApiReleaseChannelOptions release)
    {
        var minRollback = NormalizeOptionalValue(options.MinimumRollbackTargetVersion);
        var rollbackTarget = NormalizeOptionalValue(release.RollbackTargetVersion);
        if (string.IsNullOrWhiteSpace(rollbackTarget))
        {
            return options.AllowRollbackToPreviousStable
                ? (false, "rollback_target_version is missing for channel.")
                : (true, null);
        }

        if (!TryParseVersionForComparison(rollbackTarget, out var rollbackVersion))
        {
            return (false, "rollback_target_version is not a valid semantic version.");
        }

        if (!TryParseVersionForComparison(release.LatestPosVersion, out var latestVersion))
        {
            return (false, "latest_pos_version is not a valid semantic version.");
        }

        if (rollbackVersion.CompareTo(latestVersion) > 0)
        {
            return (false, "rollback_target_version cannot be greater than latest_pos_version.");
        }

        if (!string.IsNullOrWhiteSpace(minRollback) &&
            TryParseVersionForComparison(minRollback, out var minRollbackVersion) &&
            rollbackVersion.CompareTo(minRollbackVersion) < 0)
        {
            return (false, "rollback_target_version is below configured minimum rollback target.");
        }

        return (true, null);
    }

    private static bool TryParseVersionForComparison(string? rawVersion, out Version value)
    {
        value = new Version(0, 0, 0);
        var token = NormalizeOptionalValue(rawVersion);
        if (string.IsNullOrWhiteSpace(token))
        {
            return false;
        }

        if (token.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            token = token[1..];
        }

        var firstCore = token
            .Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(firstCore))
        {
            return false;
        }

        var versionText = firstCore.Replace('_', '.');
        var parts = versionText.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
        {
            versionText = $"{parts[0]}.0.0";
        }
        else if (parts.Length == 2)
        {
            versionText = $"{parts[0]}.{parts[1]}.0";
        }
        else if (parts.Length > 3)
        {
            versionText = $"{parts[0]}.{parts[1]}.{parts[2]}";
        }

        if (!Version.TryParse(versionText, out var parsedVersion) || parsedVersion is null)
        {
            return false;
        }

        value = parsedVersion;
        return true;
    }

    private static string NormalizeReleaseChannel(string? channel)
    {
        var normalized = NormalizeOptionalValue(channel)?.ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "stable" : normalized;
    }

    private static string NormalizeVersion(string? version)
    {
        return NormalizeOptionalValue(version) ?? "1.0.0";
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
