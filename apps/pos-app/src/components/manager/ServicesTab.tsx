import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteService,
  fetchCategories,
  fetchServices,
  type Category,
  type Service,
} from "@/lib/api";
import ServiceManagementDialog from "@/components/manager/ServiceManagementDialog";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function ServicesTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, categoryRows] = await Promise.all([
        fetchServices(),
        fetchCategories(true),
      ]);
      setServices(rows);
      setCategories(categoryRows);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load services.",
      );
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return services.filter((service) => {
      const matchesSearch =
        !normalized ||
        [
          service.name,
          service.sku ?? "",
          service.description ?? "",
          service.category_name ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && service.is_active) ||
        (statusFilter === "inactive" && !service.is_active);
      const matchesCategory =
        categoryFilter === "all" || service.category_id === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [search, services, statusFilter, categoryFilter]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );

  const handleSoftDelete = async (service: Service) => {
    setDeletingId(service.id);
    try {
      await deleteService(service.id);
      toast.success("Service deactivated.");
      setServices((prev) => prev.filter((row) => row.id !== service.id));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to deactivate service.",
      );
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
      <div className="flex justify-end">
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

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, SKU, category..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as "all" | "active" | "inactive")
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {activeCategories.map((category) => (
              <SelectItem
                key={category.category_id}
                value={category.category_id}
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                >
                  Loading services...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-sm text-muted-foreground"
                >
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
                      <p className="text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>{service.sku || "-"}</TableCell>
                  <TableCell>{service.category_name || "-"}</TableCell>
                  <TableCell className="text-right">
                    {currencyFormatter.format(service.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    {service.duration_minutes && service.duration_minutes > 0
                      ? `${service.duration_minutes} min`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={service.is_active ? "default" : "secondary"}
                    >
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
