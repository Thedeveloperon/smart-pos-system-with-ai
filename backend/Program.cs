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
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend-dev", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8080",
                "http://127.0.0.1:8080")
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

    options.UseNpgsql(postgresConnectionString);
});

var app = builder.Build();
var staticFilesAvailable = Directory.Exists(
    Path.Combine(app.Environment.ContentRootPath, "wwwroot"));

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

app.UseCors("frontend-dev");
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

if (staticFilesAvailable)
{
    app.MapFallbackToFile("index.html");
}

app.Run();

public partial class Program;
