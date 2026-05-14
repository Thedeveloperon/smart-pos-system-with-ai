namespace SmartPos.Backend.Features.Purchases;

internal sealed record PurchaseBillInventoryLine(
    Guid ProductId,
    decimal Quantity,
    decimal UnitCost,
    decimal LineTotal,
    string? SupplierItemName,
    string? BatchNumber,
    DateTimeOffset? ExpiryDate,
    DateTimeOffset? ManufactureDate,
    IReadOnlyCollection<string>? SerialValues = null);
