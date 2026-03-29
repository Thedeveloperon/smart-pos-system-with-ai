using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SmartPos.Backend.Features.Auth;
using SmartPos.Backend.Features.Checkout;
using SmartPos.Backend.Features.Products;
using SmartPos.Backend.Features.Reports;
using SmartPos.Backend.Features.Receipts;
using SmartPos.Backend.Features.Refunds;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Features.Sync;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

var builder = WebApplication.CreateBuilder(args);
var jwtOptions = builder.Configuration
                     .GetSection(JwtCookieOptions.SectionName)
                     .Get<JwtCookieOptions>()
                 ?? new JwtCookieOptions();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton(jwtOptions);
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
        policy.RequireRole(SmartPosRoles.Owner, SmartPosRoles.Manager));
});
builder.Services.AddScoped<CheckoutService>();
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<ReceiptService>();
builder.Services.AddScoped<RefundService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<SyncEventsProcessor>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AuditLogService>();
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
    await DbSchemaUpdater.EnsureRefundSchemaAsync(dbContext);
    await DbSeeder.SeedAsync(dbContext);
}

app.UseCors("frontend-dev");
app.UseAuthentication();
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
app.MapSyncEndpoints();
app.MapProductEndpoints();
app.MapCheckoutEndpoints();
app.MapReceiptEndpoints();
app.MapRefundEndpoints();
app.MapReportEndpoints();

app.Run();

public partial class Program;
