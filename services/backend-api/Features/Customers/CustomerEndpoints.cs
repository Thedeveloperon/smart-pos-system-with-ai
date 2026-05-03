using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Customers;

public static class CustomerEndpoints
{
    public static IEndpointRouteBuilder MapCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        var customerGroup = app.MapGroup("/api/customers").WithTags("Customers");
        var tierGroup = app.MapGroup("/api/customer-price-tiers").WithTags("Customer Price Tiers");

        customerGroup.MapGet("/search", async (
            string? q,
            int? take,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            var result = await customerService.SearchCustomersAsync(q, take ?? 20, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("SearchCustomers")
        .WithOpenApi();

        customerGroup.MapGet("", async (
            bool? include_inactive,
            int? page,
            int? take,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            var result = await customerService.GetCustomersAsync(
                include_inactive ?? false,
                page ?? 1,
                take ?? 20,
                cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCustomers")
        .WithOpenApi();

        customerGroup.MapPost("", async (
            UpsertCustomerRequest request,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.CreateCustomerAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateCustomer")
        .WithOpenApi();

        customerGroup.MapGet("/{customerId:guid}", async (
            Guid customerId,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.GetCustomerAsync(customerId, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCustomer")
        .WithOpenApi();

        customerGroup.MapPut("/{customerId:guid}", async (
            Guid customerId,
            UpsertCustomerRequest request,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.UpdateCustomerAsync(customerId, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("UpdateCustomer")
        .WithOpenApi();

        customerGroup.MapPatch("/{customerId:guid}/toggle-active", async (
            Guid customerId,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.ToggleActiveAsync(customerId, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ToggleCustomerActive")
        .WithOpenApi();

        customerGroup.MapDelete("/{customerId:guid}/hard-delete", async (
            Guid customerId,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await customerService.HardDeleteCustomerAsync(customerId, cancellationToken);
                return Results.NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("HardDeleteCustomer")
        .WithOpenApi();

        customerGroup.MapGet("/{customerId:guid}/sales", async (
            Guid customerId,
            int? take,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.GetCustomerSalesAsync(customerId, take ?? 20, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCustomerSales")
        .WithOpenApi();

        customerGroup.MapGet("/{customerId:guid}/credit-ledger", async (
            Guid customerId,
            int? page,
            int? take,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.GetCreditLedgerAsync(customerId, page ?? 1, take ?? 20, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCustomerCreditLedger")
        .WithOpenApi();

        customerGroup.MapPost("/{customerId:guid}/credit-payments", async (
            Guid customerId,
            RecordCreditPaymentRequest request,
            ClaimsPrincipal user,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.RecordCreditPaymentAsync(
                    customerId,
                    request,
                    ResolveUserId(user),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("RecordCustomerCreditPayment")
        .WithOpenApi();

        customerGroup.MapPost("/{customerId:guid}/credit-adjustments", async (
            Guid customerId,
            ManualCreditAdjustmentRequest request,
            ClaimsPrincipal user,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.ManualCreditAdjustmentAsync(
                    customerId,
                    request,
                    ResolveUserId(user),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("AdjustCustomerCredit")
        .WithOpenApi();

        tierGroup.MapGet("", async (
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            var result = await customerService.GetPriceTiersAsync(cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCustomerPriceTiers")
        .WithOpenApi();

        tierGroup.MapPost("", async (
            UpsertPriceTierRequest request,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.CreatePriceTierAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateCustomerPriceTier")
        .WithOpenApi();

        tierGroup.MapPut("/{priceTierId:guid}", async (
            Guid priceTierId,
            UpsertPriceTierRequest request,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await customerService.UpdatePriceTierAsync(priceTierId, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("UpdateCustomerPriceTier")
        .WithOpenApi();

        tierGroup.MapDelete("/{priceTierId:guid}/hard-delete", async (
            Guid priceTierId,
            CustomerService customerService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await customerService.DeletePriceTierAsync(priceTierId, cancellationToken);
                return Results.NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("HardDeleteCustomerPriceTier")
        .WithOpenApi();

        return app;
    }

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }
}
