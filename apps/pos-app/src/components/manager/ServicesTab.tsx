import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteService, fetchServices, type Service } from "@/lib/api";
import ServiceManagementDialog from "@/components/manager/ServiceManagementDialog";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ServicesTab() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchServices();
      setServices(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load services.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return services;
    }

    const normalized = query.trim().toLowerCase();
    return services.filter((service) =>
      [service.name, service.sku ?? "", service.description ?? "", service.category_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, services]);

  const handleSoftDelete = async (service: Service) => {
    setDeletingId(service.id);
    try {
      await deleteService(service.id);
      toast.success("Service deactivated.");
      setServices((prev) => prev.filter((row) => row.id !== service.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate service.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = (service: Service) => {
    setServices((prev) => {
      const index = prev.findIndex((item) => item.id === service.id);
      if (index < 0) {
        return [service, ...prev];
      }

      return prev.map((item) => (item.id === service.id ? service : item));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search services by name or SKU..."
          className="sm:max-w-sm"
        />
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            setSelectedService(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Service
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Default Price</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  Loading services...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No services found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-emerald-600" />
                      <span>{service.name}</span>
                    </div>
                    {service.description ? (
                      <p className="text-xs text-muted-foreground">{service.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{service.sku || "-"}</TableCell>
                  <TableCell>{service.category_name || "-"}</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(service.price)}</TableCell>
                  <TableCell className="text-right">
                    {service.duration_minutes && service.duration_minutes > 0
                      ? `${service.duration_minutes} min`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={service.is_active ? "default" : "secondary"}>
                      {service.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedService(service);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deletingId === service.id}
                        onClick={() => {
                          void handleSoftDelete(service);
                        }}
                      >
                        Deactivate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ServiceManagementDialog
        open={dialogOpen}
        service={selectedService}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
