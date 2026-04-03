using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.Auth;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Features.Checkout;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Features.Products;
using SmartPos.Backend.Features.Purchases;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Features.Receipts;
using SmartPos.Backend.Features.Refunds;
using SmartPos.Backend.Features.Settings;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Features.Sync;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

var builder = WebApplication.CreateBuilder(args);
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
builder.Services.Configure<AiSuggestionOptions>(
    builder.Configuration.GetSection(AiSuggestionOptions.SectionName));
builder.Services.Configure<AiInsightOptions>(
    builder.Configuration.GetSection(AiInsightOptions.SectionName));
builder.Services.Configure<LicenseOptions>(
    builder.Configuration.GetSection(LicenseOptions.SectionName));
builder.Services.Configure<AuthSecurityOptions>(
    builder.Configuration.GetSection(AuthSecurityOptions.SectionName));
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<LicensingMetrics>();
builder.Services.AddSingleton<LicensingAlertMonitor>();
builder.Services.AddSingleton<ILicensingAlertMonitor>(
    serviceProvider => serviceProvider.GetRequiredService<LicensingAlertMonitor>());
builder.Services.AddHostedService(
    serviceProvider => serviceProvider.GetRequiredService<LicensingAlertMonitor>());
builder.Services.AddHostedService<LicenseTokenSessionCleanupService>();
builder.Services.AddHostedService<BillingStateReconciliationService>();
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
});
builder.Services.AddScoped<CheckoutService>();
builder.Services.AddScoped<CashSessionService>();
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<PurchaseService>();
builder.Services.AddScoped<ReceiptService>();
builder.Services.AddScoped<RefundService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<ShopProfileService>();
builder.Services.AddScoped<SyncEventsProcessor>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<LicenseService>();
builder.Services.AddScoped<DeviceActionProofService>();
builder.Services.AddScoped<AiCreditBillingService>();
builder.Services.AddScoped<AiCreditPaymentService>();
builder.Services.AddHttpClient<AiSuggestionService>();
builder.Services.AddHttpClient<AiInsightService>();
builder.Services.AddSingleton<BasicTextOcrProvider>();
builder.Services.AddSingleton<TesseractOcrProvider>();
builder.Services.AddSingleton<IOcrProviderCore>(serviceProvider =>
{
    var purchasingOptions = serviceProvider.GetRequiredService<IOptions<PurchasingOptions>>().Value;
    var configuredProvider = purchasingOptions.OcrProvider?.Trim();

    if (string.Equals(configuredProvider, "tesseract", StringComparison.OrdinalIgnoreCase))
    {
        return serviceProvider.GetRequiredService<TesseractOcrProvider>();
    }

    if (!string.IsNullOrWhiteSpace(configuredProvider) &&
        !string.Equals(configuredProvider, "basic-text", StringComparison.OrdinalIgnoreCase))
    {
        var logger = serviceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
        logger.LogWarning(
            "Unknown Purchasing:OcrProvider value '{Provider}'. Falling back to basic-text.",
            configuredProvider);
    }

    return serviceProvider.GetRequiredService<BasicTextOcrProvider>();
});
builder.Services.AddSingleton<IOcrProvider, ResilientOcrProvider>();
builder.Services.AddSingleton<IBillMalwareScanner, NoOpBillMalwareScanner>();

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
    await DbSchemaUpdater.EnsureShopProfileSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureRefundSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureCashSessionSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsurePurchasingSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureLicensingSchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureAuthSecuritySchemaAsync(dbContext);
    await DbSchemaUpdater.EnsureAiInsightsSchemaAsync(dbContext);
    await DbSeeder.SeedAsync(dbContext);
}

if (staticFilesAvailable)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseCors("frontend");
app.UseMiddleware<ProvisioningRateLimitMiddleware>();
app.UseAuthentication();
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
app.MapLicensingEndpoints();
app.MapDeviceActionProofEndpoints();
app.MapAiSuggestionEndpoints();
app.MapCashSessionEndpoints();
app.MapSyncEndpoints();
app.MapProductEndpoints();
app.MapPurchaseEndpoints();
app.MapCheckoutEndpoints();
app.MapReceiptEndpoints();
app.MapRefundEndpoints();
app.MapSettingsEndpoints();
app.MapReportEndpoints();

if (staticIndexFileAvailable)
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
