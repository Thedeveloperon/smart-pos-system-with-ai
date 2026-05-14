using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SmartPos.Backend.Infrastructure.Json;

public sealed class FlexibleDateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            throw new JsonException("A date value is required.");
        }

        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException("Date values must be JSON strings.");
        }

        var raw = reader.GetString();
        if (!TryParse(raw, out var parsed))
        {
            throw new JsonException("Invalid date value. Use ISO 8601 or yyyy-MM-dd.");
        }

        return parsed;
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value);
    }

    internal static bool TryParse(string? raw, out DateTimeOffset parsed)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            parsed = default;
            return false;
        }

        if (DateTimeOffset.TryParse(
                raw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
                out parsed))
        {
            return true;
        }

        if (DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOnly))
        {
            var localDate = DateTime.SpecifyKind(dateOnly.ToDateTime(TimeOnly.MinValue), DateTimeKind.Local);
            parsed = new DateTimeOffset(localDate);
            return true;
        }

        parsed = default;
        return false;
    }
}

public sealed class FlexibleNullableDateTimeOffsetJsonConverter : JsonConverter<DateTimeOffset?>
{
    public override DateTimeOffset? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException("Date values must be JSON strings.");
        }

        var raw = reader.GetString();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (!FlexibleDateTimeOffsetJsonConverter.TryParse(raw, out var parsed))
        {
            throw new JsonException("Invalid date value. Use ISO 8601 or yyyy-MM-dd.");
        }

        return parsed;
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            writer.WriteStringValue(value.Value);
            return;
        }

        writer.WriteNullValue();
    }
}
