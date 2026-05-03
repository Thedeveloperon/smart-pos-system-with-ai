using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.AiChat;
using SmartPos.Backend.Features.AiChat.IntentPipeline;
using SmartPos.Backend.Features.Auth;
using SmartPos.Backend.Features.Batches;
using SmartPos.Backend.Features.CloudAccount;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Features.Checkout;
using SmartPos.Backend.Features.Customers;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Features.Products;
using SmartPos.Backend.Features.Purchases;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Features.Recovery;
using SmartPos.Backend.Features.Reminders;
using SmartPos.Backend.Features.Receipts;
using SmartPos.Backend.Features.Refunds;
using SmartPos.Backend.Features.SerialNumbers;
using SmartPos.Backend.Features.Stocktake;
using SmartPos.Backend.Features.Settings;
using SmartPos.Backend.Features.WarrantyClaims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Features.Sync;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService();
var jwtOptions = builder.Configuration
                     .GetSection(JwtCookieOptions.SectionName)
                     .Get<JwtCookieOptions>()
                 ?? new JwtCookieOptions();
var jwtSecretEnvironmentVariable = string.IsNullOrWhiteSpace(jwtOptions.SecretKeyEnvironmentVariable)
    ? "SMARTPOS_JWT_SECRET"
    : jwtOptions.SecretKeyEnvironmentVariable.Trim();
var jwtSecretFromEnvironment = Environment.GetEnvironmentVariable(jwtSecretEnvironmentVariable);
if (!string.IsNullOrWhiteSpace(jwtSecretFromEnvironment))
{
    jwtOptions.SecretKey = jwtSecretFromEnvironment.Trim();
}

if (string.IsNullOrWhiteSpace(jwtOptions.SecretKey))
{
    throw new InvalidOperationException(
        $"JWT secret key is not configured. Set '{JwtCookieOptions.SectionName}:SecretKey' or environment variable '{jwtSecretEnvironmentVariable}'.");
}

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.Configure<PurchasingOptions>(
    builder.Configuration.GetSection(PurchasingOptions.SectionName));
builder.Services.Configure<ProductBarcodeFeatureOptions>(
    builder.Configuration.GetSection(ProductBarcodeFeatureOptions.SectionName));
builder.Services.Configure<AiSuggestionOptions>(
    builder.Configuration.GetSection(AiSuggestionOptions.SectionName));
builder.Services.Configure<AiInsightOptions>(
    builder.Configuration.GetSection(AiInsightOptions.SectionName));
builder.Services.Configure<ReminderOptions>(
    builder.Configuration.GetSection(ReminderOptions.SectionName));
builder.Services.Configure<LicenseOptions>(
    builder.Configuration.GetSection(LicenseOptions.SectionName));
builder.Services.Configure<AuthSecurityOptions>(
    builder.Configuration.GetSection(AuthSecurityOptions.SectionName));
builder.Services.Configure<RecoveryOpsOptions>(
    builder.Configuration.GetSection(RecoveryOpsOptions.SectionName));
builder.Services.Configure<CloudApiCompatibilityOptions>(
    builder.Configuration.GetSection(CloudApiCompatibilityOptions.SectionName));

ValidateAiProviderPolicy(builder.Configuration, builder.Environment);
ValidateLicenseCloudRelayPolicy(builder.Configuration);
ValidateAiCreditRelayPolicy(builder.Configuration);

static void ValidateAiProviderPolicy(IConfiguration configuration, IWebHostEnvironment environment)
{
    var suggestionOptions = configuration
                                .GetSection(AiSuggestionOptions.SectionName)
                                .Get<AiSuggestionOptions>()
                            ?? new AiSuggestionOptions();
    var insightOptions = configuration
                             .GetSection(AiInsightOptions.SectionName)
                             .Get<AiInsightOptions>()
                         ?? new AiInsightOptions();

    ValidateAiProviderPolicyForSection(
        sectionName: AiSuggestionOptions.SectionName,
        provider: suggestionOptions.Provider,
        enabled: suggestionOptions.Enabled,
        allowNonOpenAiInNonProduction: suggestionOptions.AllowNonOpenAiInNonProduction,
        environment: environment,
        skipOpenAiRequirement: false);
    ValidateAiProviderPolicyForSection(
        sectionName: AiInsightOptions.SectionName,
        provider: insightOptions.Provider,
        enabled: insightOptions.Enabled,
        allowNonOpenAiInNonProduction: insightOptions.AllowNonOpenAiInNonProduction,
        environment: environment,
        skipOpenAiRequirement: insightOptions.CloudRelayEnabled);

    var needsOpenAiKey = suggestionOptions.Enabled &&
                         IsOpenAiProvider(suggestionOptions.Provider) ||
                         insightOptions.Enabled &&
                         IsOpenAiProvider(insightOptions.Provider) &&
                         !insightOptions.CloudRelayEnabled;
    if (!needsOpenAiKey)
    {
        return;
    }

    var configuredEnvironmentVariable = (insightOptions.OpenAiApiKeyEnvironmentVariable ?? string.Empty).Trim();
    var environmentVariableName = string.IsNullOrWhiteSpace(configuredEnvironmentVariable)
        ? "OPENAI_API_KEY"
        : configuredEnvironmentVariable;

    var apiKey = Environment.GetEnvironmentVariable(environmentVariableName)
                 ?? configuration["OpenAI:ApiKey"]
                 ?? configuration["OPENAI_API_KEY"]
                 ?? (insightOptions.OpenAiApiKey ?? string.Empty).Trim();
    if (!string.IsNullOrWhiteSpace(apiKey))
    {
        return;
    }

    throw new InvalidOperationException(
        $"OpenAI API key is not configured. Set environment variable '{environmentVariableName}' or configure 'OpenAI:ApiKey'.");
}

static void ValidateAiProviderPolicyForSection(
    string sectionName,
    string provider,
    bool enabled,
    bool allowNonOpenAiInNonProduction,
    IWebHostEnvironment environment,
    bool skipOpenAiRequirement)
{
    if (!enabled)
    {
        return;
    }

    if (skipOpenAiRequirement)
    {
        return;
    }

    var normalizedProvider = NormalizeAiProvider(provider, defaultProvider: "local");
    var isProtectedEnvironment = environment.IsProduction() || environment.IsStaging();

    if (isProtectedEnvironment)
    {
        if (!IsOpenAiProvider(normalizedProvider))
        {
            throw new InvalidOperationException(
                $"{sectionName}:Provider must be 'OpenAI' in {environment.EnvironmentName}.");
        }

        return;
    }

    if (!IsOpenAiProvider(normalizedProvider) && !allowNonOpenAiInNonProduction)
    {
        throw new InvalidOperationException(
            $"{sectionName}:Provider '{provider}' is not allowed in {environment.EnvironmentName} unless {sectionName}:AllowNonOpenAiInNonProduction=true.");
    }
}

static string NormalizeAiProvider(string provider, string defaultProvider)
{
    var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
    return string.IsNullOrWhiteSpace(normalized) ? defaultProvider : normalized;
}

static bool IsOpenAiProvider(string provider)
{
    return string.Equals(provider, "openai", StringComparison.OrdinalIgnoreCase);
}

static void ValidateLicenseCloudRelayPolicy(IConfiguration configuration)
{
    var options = configuration
                      .GetSection(LicenseOptions.SectionName)
                      .Get<LicenseOptions>()
                  ?? new LicenseOptions();
    var mode = (options.Mode ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(mode))
    {
        mode = "LocalOffline";
    }

    if (string.Equals(mode, "LocalOffline", StringComparison.OrdinalIgnoreCase) &&
        !options.RequireActivationEntitlementKey)
    {
        throw new InvalidOperationException(
            "Licensing:RequireActivationEntitlementKey must be true when Licensing:Mode=LocalOffline.");
    }

    if (options.CloudRelayEnabled &&
        string.Equals(mode, "LocalOffline", StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            "Licensing:CloudRelayEnabled cannot be true when Licensing:Mode=LocalOffline.");
    }

    if (options.CloudRelayEnabled &&
        !options.CloudLicensingEndpointsEnabled)
    {
        throw new InvalidOperationException(
            "Licensing:CloudRelayEnabled requires Licensing:CloudLicensingEndpointsEnabled=true.");
    }

    if (!options.CloudRelayEnabled)
    {
        return;
    }

    var baseUrl = (options.CloudRelayBaseUrl ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(baseUrl))
    {
        throw new InvalidOperationException(
            "Licensing cloud relay is enabled, but Licensing:CloudRelayBaseUrl is not configured.");
    }

    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var relayUri) ||
        !string.Equals(relayUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
    {
        throw new InvalidOperationException(
            "Licensing:CloudRelayBaseUrl must be an absolute HTTPS URL when Licensing:CloudRelayEnabled=true.");
    }
}

static void ValidateAiCreditRelayPolicy(IConfiguration configuration)
{
    var options = configuration
                      .GetSection(AiInsightOptions.SectionName)
                      .Get<AiInsightOptions>()
                  ?? new AiInsightOptions();

    if (!options.CloudRelayEnabled)
    {
        return;
    }

    var baseUrl = (options.CloudRelayBaseUrl ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(baseUrl))
    {
        throw new InvalidOperationException(
            "AiInsights:CloudRelayBaseUrl is required when AiInsights:CloudRelayEnabled=true.");
    }

    if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out _))
    {
        throw new InvalidOperationException(
            "AiInsights:CloudRelayBaseUrl must be a valid absolute URL when AiInsights:CloudRelayEnabled=true.");
    }
}

builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<IOpsAlertPublisher, WebhookOpsAlertPublisher>();
builder.Services.AddSingleton<LicensingMetrics>();
builder.Services.AddSingleton<LicenseCloudRelayMetrics>();
builder.Services.AddSingleton<LicenseCloudRelayStatusCache>();
builder.Services.AddSingleton<AiCreditCloudRelayMetrics>();
builder.Services.AddSingleton<AiCreditCloudRelayWalletCache>();
builder.Services.AddSingleton<LicensingAlertMonitor>();
builder.Services.AddSingleton<ILicensingAlertMonitor>(
    serviceProvider => serviceProvider.GetRequiredService<LicensingAlertMonitor>());
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<LicensingAlertMonitor>());
builder.Services.AddHostedService<LicenseTokenSessionCleanupService>();
builder.Services.AddHostedService<BillingStateReconciliationService>();
builder.Services.AddSingleton<AiAuthorizationReconciliationService>();
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<AiAuthorizationReconciliationService>());
builder.Services.AddSingleton<AiPrivacyRetentionCleanupService>();
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<AiPrivacyRetentionCleanupService>());
builder.Services.AddHostedService<ReminderSchedulerService>();
builder.Services.AddSingleton<RecoverySchedulerService>();
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<RecoverySchedulerService>());
builder.Services.AddSingleton<RecoveryDrillAlertService>();
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<RecoveryDrillAlertService>());
builder.Services.AddHttpContextAccessor();
var corsFromArray = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? Array.Empty<string>();
var corsFromCsv = (builder.Configuration["Cors:AllowedOriginsCsv"] ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var corsOrigins = corsFromArray
    .Concat(corsFromCsv)
    .Select(origin => origin.Trim().TrimEnd('/'))
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

if (corsOrigins.Length == 0)
{
    corsOrigins =
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ];
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        policy.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SecretKey)),
            ClockSkew = TimeSpan.FromMinutes(1)
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.TryGetValue(jwtOptions.CookieName, out var token))
                {
                    context.Token = token;
                }

                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(SmartPosPolicies.ManagerOrOwner, policy =>
        policy.RequireRole(
            SmartPosRoles.Owner,
            SmartPosRoles.Manager,
            SmartPosRoles.SuperAdmin,
            SmartPosRoles.Support,
            SmartPosRoles.BillingAdmin,
            SmartPosRoles.SecurityAdmin));
    options.AddPolicy(SmartPosPolicies.SuperAdmin, policy =>
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true"));
    options.AddPolicy(SmartPosPolicies.SuperAdminOperator, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.Support ||
                       scope == SmartPosRoles.BillingAdmin ||
                       scope == SmartPosRoles.SecurityAdmin;
            });
    });
    options.AddPolicy(SmartPosPolicies.SupportOperator, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.Support;
            });
    });
    options.AddPolicy(SmartPosPolicies.SupportOrSecurity, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.Support ||
                       scope == SmartPosRoles.SecurityAdmin;
            });
    });
    options.AddPolicy(SmartPosPolicies.SupportOrBilling, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.Support ||
                       scope == SmartPosRoles.BillingAdmin;
            });
    });
    options.AddPolicy(SmartPosPolicies.BillingOrSecurity, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.BillingAdmin ||
                       scope == SmartPosRoles.SecurityAdmin;
            });
    });
    options.AddPolicy(SmartPosPolicies.BillingApprover, policy =>
    {
        policy.RequireRole(SmartPosRoles.SuperAdmin)
            .RequireClaim("mfa_verified", "true")
            .RequireAssertion(context =>
            {
                var scope = context.User.FindFirst("super_admin_scope")?.Value?.Trim().ToLowerInvariant();
                return scope == SmartPosRoles.SuperAdmin ||
                       scope == SmartPosRoles.BillingAdmin;
            });
    });
});
builder.Services.AddScoped<CheckoutService>();
builder.Services.AddScoped<CustomerService>();
builder.Services.AddScoped<CashSessionService>();
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<StockMovementHelper>();
builder.Services.AddScoped<BatchDepletionHelper>();
builder.Services.AddScoped<PurchaseService>();
builder.Services.AddScoped<PurchaseOrderService>();
builder.Services.AddScoped<ReceiptService>();
builder.Services.AddScoped<RefundService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ShopProfileService>();
builder.Services.AddScoped<ShopStockSettingsService>();
builder.Services.AddScoped<SyncEventsProcessor>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<LicenseService>();
builder.Services.AddScoped<LicenseCloudRelayService>();
builder.Services.AddScoped<AiCreditCloudRelayService>();
builder.Services.AddScoped<LicensingMigrationDryRunService>();
builder.Services.AddScoped<RecoveryOpsService>();
builder.Services.AddScoped<DeviceActionProofService>();
builder.Services.AddScoped<AiCreditBillingService>();
builder.Services.AddScoped<AiCreditPaymentService>();
builder.Services.AddScoped<AiPrivacyGovernanceService>();
builder.Services.AddScoped<AiChatIntentClassifier>();
builder.Services.AddScoped<AiChatEntityResolver>();
builder.Services.AddScoped<AiChatUnsupportedResponseBuilder>();
builder.Services.AddScoped<AiChatGroundingOrchestrator>();
builder.Services.AddScoped<AiChatStructuredResponseBuilder>();
builder.Services.AddScoped<IAiChatGroundingHandler, StockGroundingHandler>();
builder.Services.AddScoped<IAiChatGroundingHandler, SalesGroundingHandler>();
builder.Services.AddScoped<IAiChatGroundingHandler, PurchasingGroundingHandler>();
builder.Services.AddScoped<IAiChatGroundingHandler, PricingGroundingHandler>();
builder.Services.AddScoped<IAiChatGroundingHandler, CashierOperationsGroundingHandler>();
builder.Services.AddScoped<IAiChatGroundingHandler, ReportsGroundingHandler>();
builder.Services.AddScoped<AiChatService>();
builder.Services.AddScoped<ReminderService>();
builder.Services.AddScoped<CloudAccountService>();
builder.Services.AddHttpClient<AiSuggestionService>();
builder.Services.AddHttpClient<AiInsightService>();
builder.Services.AddHttpClient("cloud-license-relay", (serviceProvider, httpClient) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<LicenseOptions>>().Value;
    var baseUrl = (options.CloudRelayBaseUrl ?? string.Empty).Trim();
    if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var relayUri))
    {
        httpClient.BaseAddress = relayUri;
    }

    var timeoutSeconds = Math.Max(1, options.CloudRelayTimeoutSeconds);
    httpClient.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
});
builder.Services.AddHttpClient("cloud-ai-relay", (serviceProvider, httpClient) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<AiInsightOptions>>().Value;
    var baseUrl = (options.CloudRelayBaseUrl ?? string.Empty).Trim();
    if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var relayUri))
    {
        httpClient.BaseAddress = relayUri;
    }

    var timeoutSeconds = Math.Max(1, options.CloudRelayTimeoutSeconds);
    httpClient.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
});
builder.Services.AddHttpClient("cloud-account-link", (serviceProvider, httpClient) =>
{
    var aiOptions = serviceProvider.GetRequiredService<IOptions<AiInsightOptions>>().Value;
    var licenseOptions = serviceProvider.GetRequiredService<IOptions<LicenseOptions>>().Value;
    var hasResolvedRelay = CloudAccountRelaySelection.TryResolve(
        aiOptions,
        licenseOptions,
        out var baseUrl,
        out var timeoutSeconds);
    if (hasResolvedRelay && Uri.TryCreate(baseUrl, UriKind.Absolute, out var relayUri))
    {
        httpClient.BaseAddress = relayUri;
    }

    httpClient.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
});
builder.Services.AddHttpClient("openai-ocr");
builder.Services.AddHttpClient("stripe-billing");
builder.Services.AddHttpClient("ops-alert-delivery");
builder.Services.AddSingleton<BasicTextOcrProvider>();
builder.Services.AddSingleton<TesseractOcrProvider>();
builder.Services.AddSingleton<OpenAiVisionOcrProvider>();
builder.Services.AddSingleton<CloudRelayOcrProvider>();
builder.Services.AddSingleton<IOcrProviderCore>(serviceProvider =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    var purchasingOptions = serviceProvider.GetRequiredService<IOptions<PurchasingOptions>>().Value;
    var aiOptions = serviceProvider.GetRequiredService<IOptions<AiInsightOptions>>().Value;
    var configuredProvider = purchasingOptions.OcrProvider?.Trim();
    var cloudRelayConfigured = aiOptions.CloudRelayEnabled &&
                               !string.IsNullOrWhiteSpace(aiOptions.CloudRelayBaseUrl);
    var localOpenAiKeyConfigured = IsPurchasingOpenAiKeyConfigured(configuration, purchasingOptions);

    if (string.Equals(configuredProvider, "cloud-relay", StringComparison.OrdinalIgnoreCase))
    {
        return serviceProvider.GetRequiredService<CloudRelayOcrProvider>();
    }

    if (string.Equals(configuredProvider, "openai", StringComparison.OrdinalIgnoreCase))
    {
        if (cloudRelayConfigured && !localOpenAiKeyConfigured)
        {
            return serviceProvider.GetRequiredService<CloudRelayOcrProvider>();
        }

        return serviceProvider.GetRequiredService<OpenAiVisionOcrProvider>();
    }

    if (string.Equals(configuredProvider, "tesseract", StringComparison.OrdinalIgnoreCase))
    {
        return serviceProvider.GetRequiredService<TesseractOcrProvider>();
    }

    if (string.IsNullOrWhiteSpace(configuredProvider) ||
        string.Equals(configuredProvider, "basic-text", StringComparison.OrdinalIgnoreCase))
    {
        return serviceProvider.GetRequiredService<BasicTextOcrProvider>();
    }

    if (!string.Equals(configuredProvider, "basic-text", StringComparison.OrdinalIgnoreCase))
    {
        var logger = serviceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
        logger.LogWarning(
            "Unknown Purchasing:OcrProvider value '{Provider}'. Falling back to openai.",
            configuredProvider);
    }

    if (string.Equals(configuredProvider, "basic-text", StringComparison.OrdinalIgnoreCase))
    {
        return serviceProvider.GetRequiredService<BasicTextOcrProvider>();
    }

    return serviceProvider.GetRequiredService<OpenAiVisionOcrProvider>();
});
builder.Services.AddSingleton<IOcrProvider, ResilientOcrProvider>();
builder.Services.AddSingleton<IBillMalwareScanner, NoOpBillMalwareScanner>();

static bool IsPurchasingOpenAiKeyConfigured(IConfiguration configuration, PurchasingOptions options)
{
    var envName = string.IsNullOrWhiteSpace(options.OpenAiApiKeyEnvironmentVariable)
        ? "OPENAI_API_KEY"
        : options.OpenAiApiKeyEnvironmentVariable.Trim();
    var envValue = Environment.GetEnvironmentVariable(envName);
    if (!string.IsNullOrWhiteSpace(envValue))
    {
        return true;
    }

    var configuredValue = configuration[$"{PurchasingOptions.SectionName}:OpenAiApiKey"] ??
                          configuration["OPENAI_API_KEY"] ??
                          options.OpenAiApiKey;
    return !string.IsNullOrWhiteSpace(configuredValue);
}

string NormalizePostgresConnectionString(string connectionString)
{
    var normalized = connectionString.Trim();
    if (string.IsNullOrWhiteSpace(normalized))
    {
        return normalized;
    }

    if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri) ||
        (!uri.Scheme.Equals("postgres", StringComparison.OrdinalIgnoreCase) &&
         !uri.Scheme.Equals("postgresql", StringComparison.OrdinalIgnoreCase)))
    {
        return normalized;
    }

    var builder = new Npgsql.NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Database = Uri.UnescapeDataString(uri.AbsolutePath.Trim('/'))
    };

    var userInfoParts = uri.UserInfo.Split(':', 2, StringSplitOptions.None);
    if (userInfoParts.Length > 0 && !string.IsNullOrWhiteSpace(userInfoParts[0]))
    {
        builder.Username = Uri.UnescapeDataString(userInfoParts[0]);
    }

    if (userInfoParts.Length > 1 && !string.IsNullOrWhiteSpace(userInfoParts[1]))
    {
        builder.Password = Uri.UnescapeDataString(userInfoParts[1]);
    }

    if (string.IsNullOrWhiteSpace(builder.Database))
    {
        throw new InvalidOperationException("Postgres connection URI must include a database name.");
    }

    var query = uri.Query.StartsWith('?') ? uri.Query[1..] : uri.Query;
    if (!string.IsNullOrWhiteSpace(query))
    {
        foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separatorIndex = segment.IndexOf('=');
            var rawKey = separatorIndex >= 0 ? segment[..separatorIndex] : segment;
            var rawValue = separatorIndex >= 0 ? segment[(separatorIndex + 1)..] : string.Empty;

            var key = Uri.UnescapeDataString(rawKey.Replace("+", "%20"));
            var value = Uri.UnescapeDataString(rawValue.Replace("+", "%20"));

            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (key.Equals("host", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("port", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("username", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("user id", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("userid", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("password", StringComparison.OrdinalIgnoreCase) ||
                key.Equals("database", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            try
            {
                builder[key] = value;
            }
            catch (ArgumentException)
            {
                // Ignore unsupported key names from provider-specific URL params.
            }
            catch (KeyNotFoundException)
            {
                // Ignore unsupported key names from provider-specific URL params.
            }
        }
    }

    return builder.ConnectionString;
}

builder.Services.AddDbContext<SmartPosDbContext>(options =>
{
    var provider = builder.Configuration.GetValue<string>("Database:Provider") ?? "Postgres";

    if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        var sqliteConnectionString = builder.Configuration.GetConnectionString("Sqlite");
        if (string.IsNullOrWhiteSpace(sqliteConnectionString))
        {
            throw new InvalidOperationException("Connection string 'Sqlite' is not configured.");
        }

        options.UseSqlite(sqliteConnectionString);
        return;
    }

    var postgresConnectionString = builder.Configuration.GetConnectionString("Postgres");
    if (string.IsNullOrWhiteSpace(postgresConnectionString))
    {
        throw new InvalidOperationException("Connection string 'Postgres' is not configured.");
    }

    options.UseNpgsql(NormalizePostgresConnectionString(postgresConnectionString));
});

var app = builder.Build();
var webRootPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var staticFilesAvailable = Directory.Exists(webRootPath);
var staticIndexFileAvailable = File.Exists(Path.Combine(webRootPath, "index.html"));

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
    dbContext.Database.EnsureCreated();
    await DbSchemaUpdater.EnsureProductImageSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureProductBarcodeSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureStockPlanningSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureInventoryManagementSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureWarrantyTimelineSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureShopProfileSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureRefundSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureSaleSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureCustomerSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureCashSessionSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsurePurchasingSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureLicensingSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureAuthSecuritySchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureAiInsightsSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureCloudApiReliabilitySchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureCloudAccountLinkSchemaAsync(dbContext);
    await DbSeeder.SeedAsync(dbContext);
}

if (staticFilesAvailable)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseCors("frontend");
app.UseMiddleware<ProvisioningRateLimitMiddleware>();
app.UseMiddleware<CloudLicensingSurfaceGuardMiddleware>();
app.UseMiddleware<CloudAiRelaySurfaceGuardMiddleware>();
app.UseMiddleware<CloudApiVersionCompatibilityMiddleware>();
app.UseMiddleware<CloudWriteReliabilityMiddleware>();
app.UseMiddleware<CloudLegacyApiDeprecationMiddleware>();
app.UseAuthentication();
app.UseMiddleware<AuthSessionRevocationMiddleware>();
app.UseMiddleware<LicenseEnforcementMiddleware>();
app.UseMiddleware<DeviceActionProofMiddleware>();
app.UseAuthorization();

app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        status = "ok",
        service = "smartpos-api",
        timestamp = DateTimeOffset.UtcNow
    });
})
.WithName("Health")
.WithOpenApi();

if (!staticIndexFileAvailable)
{
    app.MapGet("/", () =>
    {
        return Results.Ok(new
        {
            status = "ok",
            service = "smartpos-api",
            message = "API is running. Use /health for service health checks.",
            timestamp = DateTimeOffset.UtcNow
        });
    })
    .WithName("Root")
    .WithOpenApi();
}

app.MapAuthEndpoints();
app.MapAccountEndpoints();
app.MapLicensingEndpoints();
app.MapCloudV1Endpoints();
app.MapCloudAiRelayEndpoints();
app.MapCloudPurchaseRelayEndpoints();
app.MapRecoveryEndpoints();
app.MapDeviceActionProofEndpoints();
app.MapAiSuggestionEndpoints();
app.MapAiChatEndpoints();
app.MapReminderEndpoints();
app.MapCashSessionEndpoints();
app.MapSyncEndpoints();
app.MapProductEndpoints();
app.MapSerialNumberEndpoints();
app.MapBatchEndpoints();
app.MapStocktakeEndpoints();
app.MapWarrantyClaimEndpoints();
app.MapInventoryEndpoints();
app.MapPurchaseEndpoints();
app.MapPurchaseOrderEndpoints();
app.MapCustomerEndpoints();
app.MapCheckoutEndpoints();
app.MapReceiptEndpoints();
app.MapRefundEndpoints();
app.MapSettingsEndpoints();
app.MapCloudAccountEndpoints();
app.MapReportEndpoints();

if (staticIndexFileAvailable)
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
