using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

internal static class TestJson
{
    public static async Task<JsonObject> ReadObjectAsync(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            var raw = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"Expected success status but received {(int)response.StatusCode} ({response.StatusCode}). Body: {raw}");
        }

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }

    public static string GetString(JsonNode node, string propertyName)
    {
        return node[propertyName]?.GetValue<string>()
               ?? throw new InvalidOperationException($"Missing string property '{propertyName}'.");
    }

    public static decimal GetDecimal(JsonNode node, string propertyName)
    {
        return node[propertyName]?.GetValue<decimal>()
               ?? throw new InvalidOperationException($"Missing decimal property '{propertyName}'.");
    }

    public static int GetInt32(JsonNode node, string propertyName)
    {
        return node[propertyName]?.GetValue<int>()
               ?? throw new InvalidOperationException($"Missing int property '{propertyName}'.");
    }
}
