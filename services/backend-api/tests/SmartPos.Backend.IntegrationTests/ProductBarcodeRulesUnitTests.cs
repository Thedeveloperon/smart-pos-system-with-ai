using SmartPos.Backend.Features.Products;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ProductBarcodeRulesUnitTests
{
    [Fact]
    public void BuildEan13_ShouldAppendKnownCheckDigit()
    {
        var barcode = ProductBarcodeRules.BuildEan13("400638133393");

        Assert.Equal("4006381333931", barcode);

        var validation = ProductBarcodeRules.Validate(barcode);
        Assert.True(validation.IsValid);
        Assert.Equal("ean-13", validation.Format);
    }

    [Fact]
    public void GenerateCandidateEan13_ShouldReturnValidEan13()
    {
        var barcode = ProductBarcodeRules.GenerateCandidateEan13(
            seed: "Integration Seed",
            storeId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
            attempt: 0);

        Assert.Equal(13, barcode.Length);
        Assert.True(barcode.All(char.IsDigit));

        var validation = ProductBarcodeRules.Validate(barcode);
        Assert.True(validation.IsValid);
        Assert.Equal("ean-13", validation.Format);
    }

    [Fact]
    public void GenerateCandidateEan13_WithIdempotencyKey_ShouldBeDeterministic()
    {
        var storeId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var first = ProductBarcodeRules.GenerateCandidateEan13(
            seed: "Integration Seed",
            storeId: storeId,
            attempt: 0,
            idempotencyKey: "barcode-idempotency-key");
        var replay = ProductBarcodeRules.GenerateCandidateEan13(
            seed: "Integration Seed",
            storeId: storeId,
            attempt: 0,
            idempotencyKey: "barcode-idempotency-key");
        var differentKey = ProductBarcodeRules.GenerateCandidateEan13(
            seed: "Integration Seed",
            storeId: storeId,
            attempt: 0,
            idempotencyKey: "barcode-idempotency-key-2");

        Assert.Equal(first, replay);
        Assert.NotEqual(first, differentKey);
    }

    [Fact]
    public void Validate_ShouldRejectEan13WithInvalidChecksum()
    {
        var validation = ProductBarcodeRules.Validate("4006381333932");

        Assert.False(validation.IsValid);
        Assert.Equal("ean-13", validation.Format);
        Assert.Contains("checksum", validation.Message ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(11, "upc-a")]
    [InlineData(7, "ean-8")]
    [InlineData(13, "gtin-14")]
    public void Validate_ShouldRejectOtherGtinsWithInvalidChecksum(int payloadLength, string expectedFormat)
    {
        var payload = string.Concat(Enumerable.Range(0, payloadLength).Select(index => (index + 1) % 10));
        var validBarcode = BuildGtin(payload);
        var invalidCheckDigit = validBarcode[^1] == '9'
            ? '0'
            : (char)(validBarcode[^1] + 1);
        var invalidBarcode = $"{validBarcode[..^1]}{invalidCheckDigit}";

        var validation = ProductBarcodeRules.Validate(invalidBarcode);

        Assert.False(validation.IsValid);
        Assert.Equal(expectedFormat, validation.Format);
        Assert.Contains("checksum", validation.Message ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_ShouldNormalizeDigitSeparatorsAndRecognizeEan13()
    {
        var validation = ProductBarcodeRules.Validate("4006-3813 3393-1");

        Assert.True(validation.IsValid);
        Assert.Equal("4006381333931", validation.Normalized);
        Assert.Equal("ean-13", validation.Format);
    }

    [Fact]
    public void Validate_ShouldAllowCustomAlphaNumericBarcode()
    {
        var validation = ProductBarcodeRules.Validate("SKU-BARCODE-001");

        Assert.True(validation.IsValid);
        Assert.Equal("custom", validation.Format);
        Assert.Equal("SKU-BARCODE-001", validation.Normalized);
    }

    [Fact]
    public void NormalizeOptionalForStorage_ShouldReturnNullForWhitespace()
    {
        Assert.Null(ProductBarcodeRules.NormalizeOptionalForStorage("  "));
    }

    private static string BuildGtin(string payloadDigits)
    {
        var checksum = 0;
        var multiplyByThree = true;
        for (var index = payloadDigits.Length - 1; index >= 0; index--)
        {
            var digit = payloadDigits[index] - '0';
            checksum += multiplyByThree ? digit * 3 : digit;
            multiplyByThree = !multiplyByThree;
        }

        var checkDigit = (10 - (checksum % 10)) % 10;
        return $"{payloadDigits}{checkDigit}";
    }
}
