using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Customers;

public sealed class CustomerService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor,
    AuditLogService auditLogService)
{
    private const string CustomerCodePrefix = "C-";
    private const string CustomerCodePattern = "Customer code must start with C- and use a numeric suffix.";

    public async Task<IReadOnlyList<PriceTierResponse>> GetPriceTiersAsync(CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var tiers = await dbContext.CustomerPriceTiers
            .AsNoTracking()
            .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
            .OrderBy(x => x.Name)
            .Select(x => new PriceTierResponse
            {
                PriceTierId = x.Id,
                Name = x.Name,
                Code = x.Code,
                DiscountPercent = x.DiscountPercent,
                Description = x.Description,
                IsActive = x.IsActive,
                CustomerCount = x.Customers.Count(y => !currentStoreId.HasValue || y.StoreId == currentStoreId.Value),
                CreatedAt = x.CreatedAtUtc,
                UpdatedAt = x.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return tiers;
    }

    public async Task<PriceTierResponse> CreatePriceTierAsync(
        UpsertPriceTierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Tier name is required.");
        var normalizedCode = NormalizeRequired(request.Code, "Tier code is required.").ToUpperInvariant();
        var discountPercent = NormalizeDiscountPercent(request.DiscountPercent);

        await EnsurePriceTierCodeUniqueAsync(normalizedCode, null, currentStoreId, cancellationToken);
        await EnsurePriceTierNameUniqueAsync(normalizedName, null, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var tier = new CustomerPriceTier
        {
            StoreId = currentStoreId,
            Name = normalizedName,
            Code = normalizedCode,
            DiscountPercent = discountPercent,
            Description = NormalizeOptional(request.Description),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.CustomerPriceTiers.Add(tier);
        auditLogService.Queue(
            action: "customer_price_tier_created",
            entityName: "customer_price_tier",
            entityId: tier.Id.ToString(),
            after: new
            {
                tier.Name,
                tier.Code,
                tier.DiscountPercent,
                tier.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await ToPriceTierResponseAsync(tier, cancellationToken);
    }

    public async Task<PriceTierResponse> UpdatePriceTierAsync(
        Guid priceTierId,
        UpsertPriceTierRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var tier = await dbContext.CustomerPriceTiers
            .FirstOrDefaultAsync(x => x.Id == priceTierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Price tier not found.");

        var normalizedName = NormalizeRequired(request.Name, "Tier name is required.");
        var normalizedCode = NormalizeRequired(request.Code, "Tier code is required.").ToUpperInvariant();
        var discountPercent = NormalizeDiscountPercent(request.DiscountPercent);

        await EnsurePriceTierCodeUniqueAsync(normalizedCode, tier.Id, currentStoreId, cancellationToken);
        await EnsurePriceTierNameUniqueAsync(normalizedName, tier.Id, currentStoreId, cancellationToken);

        var before = new
        {
            tier.Name,
            tier.Code,
            tier.DiscountPercent,
            tier.IsActive
        };

        tier.Name = normalizedName;
        tier.Code = normalizedCode;
        tier.DiscountPercent = discountPercent;
        tier.Description = NormalizeOptional(request.Description);
        tier.IsActive = request.IsActive;
        tier.UpdatedAtUtc = DateTimeOffset.UtcNow;

        auditLogService.Queue(
            action: "customer_price_tier_updated",
            entityName: "customer_price_tier",
            entityId: tier.Id.ToString(),
            before: before,
            after: new
            {
                tier.Name,
                tier.Code,
                tier.DiscountPercent,
                tier.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await ToPriceTierResponseAsync(tier, cancellationToken);
    }

    public async Task DeletePriceTierAsync(Guid priceTierId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var tier = await dbContext.CustomerPriceTiers
            .FirstOrDefaultAsync(x => x.Id == priceTierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Price tier not found.");

        var linkedCustomers = await dbContext.Customers
            .AsNoTracking()
            .AnyAsync(x => x.PriceTierId == priceTierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
        if (linkedCustomers)
        {
            throw new InvalidOperationException("Cannot delete price tier because customers are linked to it.");
        }

        dbContext.CustomerPriceTiers.Remove(tier);
        auditLogService.Queue(
            action: "customer_price_tier_deleted",
            entityName: "customer_price_tier",
            entityId: tier.Id.ToString(),
            before: new
            {
                tier.Name,
                tier.Code,
                tier.DiscountPercent,
                tier.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CustomerListItem>> SearchCustomersAsync(
        string? query,
        int take,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 50);
        var normalizedQuery = NormalizeOptional(query)?.ToLowerInvariant();

        var customerQuery = dbContext.Customers
            .AsNoTracking()
            .Include(x => x.PriceTier)
            .Include(x => x.Tags)
            .Where(x => x.IsActive && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value));

        if (!string.IsNullOrWhiteSpace(normalizedQuery))
        {
            customerQuery = customerQuery.Where(x =>
                x.Name.ToLower().Contains(normalizedQuery) ||
                (x.Code != null && x.Code.ToLower().Contains(normalizedQuery)) ||
                (x.IdNumber != null && x.IdNumber.ToLower().Contains(normalizedQuery)) ||
                (x.Phone != null && x.Phone.ToLower().Contains(normalizedQuery)) ||
                (x.Email != null && x.Email.ToLower().Contains(normalizedQuery)));
        }

        var customers = await customerQuery
            .OrderBy(x => x.Name)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        return customers.Select(x => ToCustomerListItem(x)).ToList();
    }

    public async Task<CustomerListResponse> GetCustomersAsync(
        bool includeInactive,
        int page,
        int take,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedPage = Math.Max(1, page);
        var normalizedTake = Math.Clamp(take, 1, 100);

        var query = dbContext.Customers
            .AsNoTracking()
            .Include(x => x.PriceTier)
            .Include(x => x.Tags)
            .Where(x => (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value) && (includeInactive || x.IsActive));

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(x => x.Name)
            .Skip((normalizedPage - 1) * normalizedTake)
            .Take(normalizedTake)
            .ToListAsync(cancellationToken);

        return new CustomerListResponse
        {
            Items = items.Select(x => ToCustomerListItem(x)).ToList(),
            Total = total,
            Page = normalizedPage,
            Take = normalizedTake
        };
    }

    public async Task<CustomerDetail> GetCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        return await ToCustomerDetailAsync(customer, cancellationToken);
    }

    public async Task<CustomerDetail> CreateCustomerAsync(
        UpsertCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedName = NormalizeRequired(request.Name, "Customer name is required.");
        var normalizedCode = await ResolveCustomerCodeAsync(request.Code, currentStoreId, cancellationToken);
        var normalizedTags = NormalizeTags(request.Tags);
        var fixedDiscountPercent = NormalizeOptionalDecimal(request.FixedDiscountPercent);
        var creditLimit = NormalizeMoney(request.CreditLimit);

        await EnsureCustomerCodeUniqueAsync(normalizedCode, null, currentStoreId, cancellationToken);
        await EnsurePriceTierExistsAsync(request.PriceTierId, currentStoreId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var customer = new Customer
        {
            StoreId = currentStoreId,
            PriceTierId = request.PriceTierId,
            Name = normalizedName,
            Code = normalizedCode,
            IdNumber = NormalizeOptional(request.IdNumber),
            Phone = NormalizeOptional(request.Phone),
            Email = NormalizeOptional(request.Email),
            Address = NormalizeOptional(request.Address),
            DateOfBirth = request.DateOfBirth,
            FixedDiscountPercent = fixedDiscountPercent,
            CreditLimit = creditLimit,
            OutstandingBalance = 0m,
            LoyaltyPoints = 0m,
            Notes = NormalizeOptional(request.Notes),
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            Tags = normalizedTags.Select(tag => new CustomerTag
            {
                StoreId = currentStoreId,
                Tag = tag,
                Customer = null!
            }).ToList()
        };

        foreach (var tag in customer.Tags)
        {
            tag.Customer = customer;
        }

        dbContext.Customers.Add(customer);
        auditLogService.Queue(
            action: "customer_created",
            entityName: "customer",
            entityId: customer.Id.ToString(),
            after: new
            {
                customer.Name,
                customer.Code,
                customer.IdNumber,
                customer.Phone,
                customer.Email,
                customer.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await ToCustomerDetailAsync(customer, cancellationToken);
    }

    public async Task<CustomerDetail> UpdateCustomerAsync(
        Guid customerId,
        UpsertCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var customer = await dbContext.Customers
            .Include(x => x.Tags)
            .Include(x => x.PriceTier)
            .FirstOrDefaultAsync(x => x.Id == customerId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Customer not found.");

        var normalizedName = NormalizeRequired(request.Name, "Customer name is required.");
        var normalizedCode = await ResolveCustomerCodeAsync(request.Code, currentStoreId, cancellationToken, customer.Id);
        var normalizedTags = NormalizeTags(request.Tags);
        var fixedDiscountPercent = NormalizeOptionalDecimal(request.FixedDiscountPercent);
        var creditLimit = NormalizeMoney(request.CreditLimit);

        await EnsureCustomerCodeUniqueAsync(normalizedCode, customer.Id, currentStoreId, cancellationToken);
        await EnsurePriceTierExistsAsync(request.PriceTierId, currentStoreId, cancellationToken);

        var before = new
        {
            customer.Name,
            customer.Code,
            customer.IdNumber,
            customer.Phone,
            customer.Email,
            customer.IsActive
        };

        customer.Name = normalizedName;
        customer.Code = normalizedCode;
        customer.IdNumber = NormalizeOptional(request.IdNumber);
        customer.Phone = NormalizeOptional(request.Phone);
        customer.Email = NormalizeOptional(request.Email);
        customer.Address = NormalizeOptional(request.Address);
        customer.DateOfBirth = request.DateOfBirth;
        customer.PriceTierId = request.PriceTierId;
        customer.FixedDiscountPercent = fixedDiscountPercent;
        customer.CreditLimit = creditLimit;
        customer.Notes = NormalizeOptional(request.Notes);
        customer.IsActive = request.IsActive;
        customer.UpdatedAtUtc = DateTimeOffset.UtcNow;

        dbContext.CustomerTags.RemoveRange(customer.Tags);
        customer.Tags.Clear();

        await dbContext.SaveChangesAsync(cancellationToken);

        if (normalizedTags.Count > 0)
        {
            var tags = normalizedTags.Select(tag => new CustomerTag
            {
                StoreId = currentStoreId,
                Tag = tag,
                CustomerId = customer.Id,
                Customer = customer
            }).ToList();

            dbContext.CustomerTags.AddRange(tags);
            customer.Tags = tags;
        }

        auditLogService.Queue(
            action: "customer_updated",
            entityName: "customer",
            entityId: customer.Id.ToString(),
            before: before,
            after: new
            {
                customer.Name,
                customer.Code,
                customer.IdNumber,
                customer.Phone,
                customer.Email,
                customer.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await ToCustomerDetailAsync(customer, cancellationToken);
    }

    public async Task<CustomerDetail> ToggleActiveAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        var before = new
        {
            customer.Name,
            customer.Code,
            customer.IsActive
        };

        customer.IsActive = !customer.IsActive;
        customer.UpdatedAtUtc = DateTimeOffset.UtcNow;

        auditLogService.Queue(
            action: customer.IsActive ? "customer_reactivated" : "customer_deactivated",
            entityName: "customer",
            entityId: customer.Id.ToString(),
            before: before,
            after: new
            {
                customer.Name,
                customer.Code,
                customer.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await ToCustomerDetailAsync(customer, cancellationToken);
    }

    public async Task HardDeleteCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var customer = await dbContext.Customers
            .Include(x => x.Tags)
            .Include(x => x.CreditLedger)
            .Include(x => x.Sales)
            .FirstOrDefaultAsync(x => x.Id == customerId, cancellationToken)
            ?? throw new KeyNotFoundException("Customer not found.");

        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        if (currentStoreId.HasValue && customer.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Customer not found.");
        }

        if (customer.Sales.Any() || customer.CreditLedger.Any())
        {
            throw new InvalidOperationException("Customer cannot be hard deleted because sales or credit history exists.");
        }

        dbContext.CustomerTags.RemoveRange(customer.Tags);
        dbContext.Customers.Remove(customer);
        auditLogService.Queue(
            action: "customer_hard_deleted",
            entityName: "customer",
            entityId: customer.Id.ToString(),
            before: new
            {
                customer.Name,
                customer.Code,
                customer.IsActive
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<CustomerSaleSummaryItem>> GetCustomerSalesAsync(
        Guid customerId,
        int take,
        CancellationToken cancellationToken)
    {
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 100);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Payments)
            .Where(x => x.CustomerId == customer.Id)
            .ToListAsync(cancellationToken);

        return sales
            .OrderByDescending(x => x.CompletedAtUtc ?? x.CreatedAtUtc)
            .Take(normalizedTake)
            .Select(x => new CustomerSaleSummaryItem
            {
                SaleId = x.Id,
                SaleNumber = x.SaleNumber,
                Status = x.Status.ToString().ToLowerInvariant(),
                PaymentMethod = x.Payments
                    .Where(p => !p.IsReversal)
                    .OrderBy(p => p.CreatedAtUtc)
                    .Select(p => p.Method.ToString().ToLowerInvariant())
                    .FirstOrDefault(),
                GrandTotal = x.GrandTotal,
                LoyaltyPointsEarned = x.LoyaltyPointsEarned,
                LoyaltyPointsRedeemed = x.LoyaltyPointsRedeemed,
                CreatedAt = x.CreatedAtUtc,
                CompletedAt = x.CompletedAtUtc
            })
            .ToList();
    }

    public async Task<CustomerCreditLedgerResponse> GetCreditLedgerAsync(
        Guid customerId,
        int page,
        int take,
        CancellationToken cancellationToken)
    {
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        var normalizedPage = Math.Max(1, page);
        var normalizedTake = Math.Clamp(take, 1, 100);

        var query = dbContext.CustomerCreditLedger
            .AsNoTracking()
            .Where(x => x.CustomerId == customer.Id);

        var total = await query.CountAsync(cancellationToken);
        var items = await query.ToListAsync(cancellationToken);

        return new CustomerCreditLedgerResponse
        {
            Items = items
                .OrderByDescending(x => x.OccurredAtUtc)
                .Skip((normalizedPage - 1) * normalizedTake)
                .Take(normalizedTake)
                .Select(x => new CreditLedgerEntry
                {
                    LedgerEntryId = x.Id,
                    CustomerId = x.CustomerId,
                    SaleId = x.SaleId,
                    EntryType = x.EntryType.ToString().ToLowerInvariant(),
                    Amount = x.Amount,
                    BalanceAfter = x.BalanceAfter,
                    Description = x.Description,
                    Reference = x.Reference,
                    RecordedByUserId = x.RecordedByUserId,
                    OccurredAt = x.OccurredAtUtc,
                    CreatedAt = x.CreatedAtUtc
                })
                .ToList(),
            Total = total,
            Page = normalizedPage,
            Take = normalizedTake
        };
    }

    public async Task<CreditLedgerEntry> RecordCreditPaymentAsync(
        Guid customerId,
        RecordCreditPaymentRequest request,
        Guid? recordedByUserId,
        CancellationToken cancellationToken)
    {
        var paymentAmount = NormalizeMoney(request.Amount);
        if (paymentAmount <= 0m)
        {
            throw new InvalidOperationException("Payment amount must be greater than zero.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        if (customer.OutstandingBalance < paymentAmount)
        {
            throw new InvalidOperationException("Payment exceeds outstanding balance.");
        }

        var nextBalance = RoundMoney(customer.OutstandingBalance - paymentAmount);
        customer.OutstandingBalance = nextBalance;
        customer.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var entry = new CustomerCreditLedgerEntry
        {
            StoreId = customer.StoreId,
            CustomerId = customer.Id,
            EntryType = CustomerCreditEntryType.Payment,
            Amount = -paymentAmount,
            BalanceAfter = nextBalance,
            Description = NormalizeOptional(request.Description) ?? "Credit payment",
            Reference = NormalizeOptional(request.Reference),
            RecordedByUserId = recordedByUserId,
            OccurredAtUtc = DateTimeOffset.UtcNow,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Customer = customer
        };

        dbContext.CustomerCreditLedger.Add(entry);
        auditLogService.Queue(
            action: "customer_credit_payment_recorded",
            entityName: "customer_credit_ledger",
            entityId: entry.Id.ToString(),
            after: new
            {
                customer.Name,
                customer.Code,
                amount = entry.Amount,
                balance_after = entry.BalanceAfter
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return ToCreditLedgerEntry(entry);
    }

    public async Task<CreditLedgerEntry> ManualCreditAdjustmentAsync(
        Guid customerId,
        ManualCreditAdjustmentRequest request,
        Guid? recordedByUserId,
        CancellationToken cancellationToken)
    {
        var amount = NormalizeMoney(request.Amount);
        if (amount == 0m)
        {
            throw new InvalidOperationException("Adjustment amount must be non-zero.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var customer = await LoadCustomerAsync(customerId, cancellationToken);
        var nextBalance = RoundMoney(Math.Max(0m, customer.OutstandingBalance + amount));
        customer.OutstandingBalance = nextBalance;
        customer.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var entry = new CustomerCreditLedgerEntry
        {
            StoreId = customer.StoreId,
            CustomerId = customer.Id,
            EntryType = CustomerCreditEntryType.Adjustment,
            Amount = amount,
            BalanceAfter = nextBalance,
            Description = NormalizeOptional(request.Description) ?? "Manual credit adjustment",
            Reference = NormalizeOptional(request.Reference),
            RecordedByUserId = recordedByUserId,
            OccurredAtUtc = DateTimeOffset.UtcNow,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Customer = customer
        };

        dbContext.CustomerCreditLedger.Add(entry);
        auditLogService.Queue(
            action: "customer_credit_adjustment_recorded",
            entityName: "customer_credit_ledger",
            entityId: entry.Id.ToString(),
            after: new
            {
                customer.Name,
                customer.Code,
                amount = entry.Amount,
                balance_after = entry.BalanceAfter
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return ToCreditLedgerEntry(entry);
    }

    private async Task<Customer> LoadCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var customer = await dbContext.Customers
            .Include(x => x.PriceTier)
            .Include(x => x.Tags)
            .Include(x => x.CreditLedger)
            .FirstOrDefaultAsync(x => x.Id == customerId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Customer not found.");

        return customer;
    }

    private async Task<CustomerDetail> ToCustomerDetailAsync(Customer customer, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var tier = customer.PriceTier ?? await dbContext.CustomerPriceTiers
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == customer.PriceTierId, cancellationToken);

        return new CustomerDetail
        {
            CustomerId = customer.Id,
            Name = customer.Name,
            Code = customer.Code ?? string.Empty,
            IdNumber = customer.IdNumber,
            Phone = customer.Phone,
            Email = customer.Email,
            Address = customer.Address,
            DateOfBirth = customer.DateOfBirth,
            PriceTier = tier is null ? null : ToPriceTierResponse(tier, customerCount: 0),
            FixedDiscountPercent = customer.FixedDiscountPercent,
            CreditLimit = customer.CreditLimit,
            OutstandingBalance = customer.OutstandingBalance,
            LoyaltyPoints = customer.LoyaltyPoints,
            Notes = customer.Notes,
            Tags = customer.Tags
                .Select(x => x.Tag)
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            IsActive = customer.IsActive,
            CreatedAt = customer.CreatedAtUtc,
            UpdatedAt = customer.UpdatedAtUtc
        };
    }

    private CustomerListItem ToCustomerListItem(Customer customer)
    {
        return new CustomerListItem
        {
            CustomerId = customer.Id,
            Name = customer.Name,
            Code = customer.Code ?? string.Empty,
            IdNumber = customer.IdNumber,
            Phone = customer.Phone,
            Email = customer.Email,
            PriceTier = customer.PriceTier is null ? null : ToPriceTierResponse(customer.PriceTier, 0),
            FixedDiscountPercent = customer.FixedDiscountPercent,
            CreditLimit = customer.CreditLimit,
            OutstandingBalance = customer.OutstandingBalance,
            LoyaltyPoints = customer.LoyaltyPoints,
            Tags = customer.Tags.Select(x => x.Tag).OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(),
            IsActive = customer.IsActive,
            CanDelete = true,
            DeleteBlockReason = null,
            CreatedAt = customer.CreatedAtUtc,
            UpdatedAt = customer.UpdatedAtUtc
        };
    }

    private async Task<PriceTierResponse> ToPriceTierResponseAsync(CustomerPriceTier tier, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var customerCount = await dbContext.Customers
            .AsNoTracking()
            .CountAsync(x => x.PriceTierId == tier.Id && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);

        return ToPriceTierResponse(tier, customerCount);
    }

    private static PriceTierResponse ToPriceTierResponse(CustomerPriceTier tier, int customerCount)
    {
        return new PriceTierResponse
        {
            PriceTierId = tier.Id,
            Name = tier.Name,
            Code = tier.Code,
            DiscountPercent = tier.DiscountPercent,
            Description = tier.Description,
            IsActive = tier.IsActive,
            CustomerCount = customerCount,
            CreatedAt = tier.CreatedAtUtc,
            UpdatedAt = tier.UpdatedAtUtc
        };
    }

    private static CreditLedgerEntry ToCreditLedgerEntry(CustomerCreditLedgerEntry entry)
    {
        return new CreditLedgerEntry
        {
            LedgerEntryId = entry.Id,
            CustomerId = entry.CustomerId,
            SaleId = entry.SaleId,
            EntryType = entry.EntryType.ToString().ToLowerInvariant(),
            Amount = entry.Amount,
            BalanceAfter = entry.BalanceAfter,
            Description = entry.Description,
            Reference = entry.Reference,
            RecordedByUserId = entry.RecordedByUserId,
            OccurredAt = entry.OccurredAtUtc,
            CreatedAt = entry.CreatedAtUtc
        };
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await dbContext.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.StoreId)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private async Task EnsureCustomerCodeUniqueAsync(
        string code,
        Guid? customerId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.Customers
            .AsNoTracking()
            .AnyAsync(x =>
                x.Code == code &&
                x.Id != customerId &&
                (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Customer code already exists.");
        }
    }

    private async Task EnsurePriceTierCodeUniqueAsync(
        string code,
        Guid? priceTierId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.CustomerPriceTiers
            .AsNoTracking()
            .AnyAsync(x =>
                x.Code == code &&
                x.Id != priceTierId &&
                (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Price tier code already exists.");
        }
    }

    private async Task EnsurePriceTierNameUniqueAsync(
        string name,
        Guid? priceTierId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.CustomerPriceTiers
            .AsNoTracking()
            .AnyAsync(x =>
                x.Name == name &&
                x.Id != priceTierId &&
                (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Price tier name already exists.");
        }
    }

    private async Task EnsurePriceTierExistsAsync(
        Guid? priceTierId,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        if (!priceTierId.HasValue)
        {
            return;
        }

        var exists = await dbContext.CustomerPriceTiers
            .AsNoTracking()
            .AnyAsync(x => x.Id == priceTierId.Value && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);

        if (!exists)
        {
            throw new InvalidOperationException("Selected price tier does not exist.");
        }
    }

    private async Task<string> ResolveCustomerCodeAsync(
        string? requestedCode,
        Guid? storeId,
        CancellationToken cancellationToken,
        Guid? customerId = null)
    {
        var normalizedCode = NormalizeOptional(requestedCode);
        if (!string.IsNullOrWhiteSpace(normalizedCode))
        {
            return normalizedCode.ToUpperInvariant();
        }

        var query = dbContext.Customers
            .AsNoTracking()
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value);
        if (customerId.HasValue)
        {
            query = query.Where(x => x.Id != customerId.Value);
        }

        var existingCodes = await query
            .Select(x => x.Code)
            .Where(x => x != null)
            .ToListAsync(cancellationToken);

        var nextNumber = existingCodes
            .Select(ParseCustomerCodeNumber)
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .DefaultIfEmpty(0)
            .Max() + 1;

        return $"{CustomerCodePrefix}{nextNumber:0000}";
    }

    private static int? ParseCustomerCodeNumber(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return null;
        }

        var normalized = code.Trim().ToUpperInvariant();
        if (!normalized.StartsWith(CustomerCodePrefix, StringComparison.Ordinal))
        {
            return null;
        }

        return int.TryParse(normalized[CustomerCodePrefix.Length..], out var number) ? number : null;
    }

    private static string NormalizeRequired(string? value, string errorMessage)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException(errorMessage);
        }

        return normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static decimal NormalizeDiscountPercent(decimal value)
    {
        if (value < 0m || value > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        return RoundMoney(value);
    }

    private static decimal? NormalizeOptionalDecimal(decimal? value)
    {
        if (!value.HasValue)
        {
            return null;
        }

        if (value.Value < 0m || value.Value > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        return RoundMoney(value.Value);
    }

    private static decimal NormalizeMoney(decimal value)
    {
        return RoundMoney(value);
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static List<string> NormalizeTags(IEnumerable<string>? tags)
    {
        return (tags ?? [])
            .Select(NormalizeOptional)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
