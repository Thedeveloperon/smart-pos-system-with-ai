using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;

namespace SmartPos.Backend.Security;

public sealed class CloudAiRelaySurfaceGuardMiddleware(
    RequestDelegate next,
    IOptions<AiInsightOptions> optionsAccessor)
{
    private readonly AiInsightOptions options = optionsAccessor.Value;

    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (options.CloudAiRelayEndpointsEnabled ||
            !IsCloudAiRelaySurfacePath(httpContext.Request.Path))
        {
            await next(httpContext);
            return;
        }

        httpContext.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await httpContext.Response.WriteAsJsonAsync(new AiRelayErrorPayload
        {
            Error = new AiRelayErrorItem
            {
                Code = AiRelayErrorCodes.CloudRelayDisabled,
                Message = "Cloud AI relay endpoints are disabled for this environment."
            }
        });
    }

    private static bool IsCloudAiRelaySurfacePath(PathString path)
    {
        return path.StartsWithSegments("/cloud/v1/ai", StringComparison.OrdinalIgnoreCase);
    }
}
