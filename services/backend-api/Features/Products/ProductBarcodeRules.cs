using System.Security.Cryptography;
using System.Text;

namespace SmartPos.Backend.Features.Products;

internal sealed class ProductBarcodeValidationResult
{
    public required bool IsValid { get; init; }
    public required string Normalized { get; init; }
    public required string Format { get; init; }
    public string? Message { get; init; }
}

internal static class ProductBarcodeRules
{
    private const int MaxBarcodeLength = 64;
    private static readonly Guid NullStoreId = Guid.Empty;

    public static string? NormalizeOptionalForStorage(string? barcode)
    {
        var trimmed = (barcode ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return null;
        }

        return NormalizeForStorage(trimmed);
    }

    public static string NormalizeForStorage(string barcode)
    {
        var trimmed = (barcode ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return string.Empty;
        }

        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        var hasOnlyDigitsSeparators = trimmed.All(ch => char.IsDigit(ch) || ch == ' ' || ch == '-');
        if (hasOnlyDigitsSeparators && digits.Length > 0 && digits.Length <= 14)
        {
            return digits;
        }

        return trimmed;
    }

    public static ProductBarcodeValidationResult Validate(string? barcode)
    {
        var trimmed = (barcode ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return Invalid("Barcode is required.");
        }

        if (trimmed.Length > MaxBarcodeLength)
        {
            return Invalid($"Barcode cannot exceed {MaxBarcodeLength} characters.");
        }

        var normalized = NormalizeForStorage(trimmed);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return Invalid("Barcode is required.");
        }

        if (normalized.Length > MaxBarcodeLength)
        {
            return Invalid($"Barcode cannot exceed {MaxBarcodeLength} characters.");
        }

        if (!normalized.All(char.IsDigit))
        {
            return Valid(normalized, "custom");
        }

        return ValidateNumericBarcode(normalized);
    }

    public static string GenerateCandidateEan13(
        string? seed,
        Guid? storeId,
        int attempt,
        string? idempotencyKey = null)
    {
        var normalizedSeed = string.IsNullOrWhiteSpace(seed)
            ? "NEWITEM"
            : seed.Trim().ToUpperInvariant();

        var storeSegment = Math.Abs((storeId ?? NullStoreId).GetHashCode()) % 100;
        var boundedAttempt = Math.Clamp(attempt, 0, 9_999);
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        string entropy;

        if (!string.IsNullOrWhiteSpace(normalizedIdempotencyKey))
        {
            // Deterministic entropy for idempotent retries.
            entropy = $"{normalizedSeed}|{storeSegment:D2}|{normalizedIdempotencyKey}|{boundedAttempt:D4}";
        }
        else
        {
            var tickSegment = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % 1_000_000;
            var randomSegment = RandomNumberGenerator.GetInt32(0, 100);
            entropy = $"{normalizedSeed}|{storeSegment:D2}|{tickSegment:D6}|{randomSegment:D2}|{boundedAttempt:D4}";
        }

        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(entropy));

        var digits = new StringBuilder(12);
        foreach (var b in hash)
        {
            digits.Append((b % 10).ToString());
            if (digits.Length >= 12)
            {
                break;
            }
        }

        while (digits.Length < 12)
        {
            digits.Append('0');
        }

        return BuildEan13(digits.ToString());
    }

    private static string? NormalizeIdempotencyKey(string? idempotencyKey)
    {
        var normalized = (idempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return normalized.Length <= 128 ? normalized : normalized[..128];
    }

    public static string BuildEan13(string seedDigits)
    {
        var baseDigits = (seedDigits ?? string.Empty).Trim();
        var normalized = new string(baseDigits.Where(char.IsDigit).ToArray());
        var firstTwelve = normalized.Length >= 12
            ? normalized[..12]
            : normalized.PadLeft(12, '0');

        var checksum = 0;
        for (var i = 0; i < firstTwelve.Length; i++)
        {
            var digit = firstTwelve[i] - '0';
            checksum += i % 2 == 0 ? digit : digit * 3;
        }

        var checkDigit = (10 - (checksum % 10)) % 10;
        return $"{firstTwelve}{checkDigit}";
    }

    private static ProductBarcodeValidationResult ValidateNumericBarcode(string digits)
    {
        return digits.Length switch
        {
            13 => HasValidGtinChecksum(digits)
                ? Valid(digits, "ean-13")
                : Invalid("EAN-13 checksum is invalid.", digits, "ean-13"),
            12 => HasValidGtinChecksum(digits)
                ? Valid(digits, "upc-a")
                : Invalid("UPC-A checksum is invalid.", digits, "upc-a"),
            8 => HasValidGtinChecksum(digits)
                ? Valid(digits, "ean-8")
                : Invalid("EAN-8 checksum is invalid.", digits, "ean-8"),
            14 => HasValidGtinChecksum(digits)
                ? Valid(digits, "gtin-14")
                : Invalid("GTIN-14 checksum is invalid.", digits, "gtin-14"),
            _ => Valid(digits, "numeric-custom")
        };
    }

    private static bool HasValidGtinChecksum(string digits)
    {
        if (string.IsNullOrWhiteSpace(digits) || digits.Length < 2 || !digits.All(char.IsDigit))
        {
            return false;
        }

        var payload = digits[..^1];
        var actualCheckDigit = digits[^1] - '0';

        var sum = 0;
        var multiplyByThree = true;
        for (var i = payload.Length - 1; i >= 0; i--)
        {
            var value = payload[i] - '0';
            sum += multiplyByThree ? value * 3 : value;
            multiplyByThree = !multiplyByThree;
        }

        var expectedCheckDigit = (10 - (sum % 10)) % 10;
        return expectedCheckDigit == actualCheckDigit;
    }

    private static ProductBarcodeValidationResult Valid(string normalized, string format)
    {
        return new ProductBarcodeValidationResult
        {
            IsValid = true,
            Normalized = normalized,
            Format = format
        };
    }

    private static ProductBarcodeValidationResult Invalid(
        string message,
        string normalized = "",
        string format = "unknown")
    {
        return new ProductBarcodeValidationResult
        {
            IsValid = false,
            Normalized = normalized,
            Format = format,
            Message = message
        };
    }
}
