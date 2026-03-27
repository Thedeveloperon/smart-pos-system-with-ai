using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string sqliteDbPath = Path.Combine(
        Path.GetTempPath(),
        $"smartpos-it-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Sqlite",
                ["ConnectionStrings:Sqlite"] = $"Data Source={sqliteDbPath}",
                ["JwtAuth:Issuer"] = "smartpos-api-tests",
                ["JwtAuth:Audience"] = "smartpos-tests",
                ["JwtAuth:SecretKey"] = "smartpos-integration-test-secret-key-2026",
                ["JwtAuth:ExpiryMinutes"] = "60",
                ["JwtAuth:CookieName"] = "smartpos_auth",
                ["JwtAuth:SecureCookie"] = "false"
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing)
        {
            return;
        }

        try
        {
            if (File.Exists(sqliteDbPath))
            {
                File.Delete(sqliteDbPath);
            }
        }
        catch
        {
            // Best-effort cleanup for temp db.
        }
    }
}
