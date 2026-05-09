import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PencilLine, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createService,
  deleteService,
  fetchCategories,
  fetchServices,
  type Category,
  type Service,
  updateService,
} from "@/lib/api";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  maximumFractionDigits: 2,
});

type FormState = {
  name: string;
  sku: string;
  price: string;
  description: string;
  categoryId: string;
  durationMinutes: string;
};

type FormErrors = {
  name?: string;
  price?: string;
  durationMinutes?: string;
};

const emptyForm = (): FormState => ({
  name: "",
  sku: "",
  price: "",
  description: "",
  categoryId: "none",
  durationMinutes: "",
});

export default function ServicesTab() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [serviceItems, categoryItems] = await Promise.all([
        fetchServices(includeInactive),
        fetchCategories(true),
      ]);
      setServices(serviceItems);
      setCategories(categoryItems);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load services.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return services;
    }

    return services.filter((service) =>
      [service.name, service.sku ?? "", service.description ?? "", service.category_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search, services]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories],
  );

  const openCreateDialog = () => {
    setEditingService(null);
    setForm(emptyForm());
    setErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (service: Service) => {
    setEditingService(service);
    setForm({
      name: service.name,
      sku: service.sku ?? "",
      price: String(service.price),
      description: service.description ?? "",
      categoryId: service.category_id ?? "none",
      durationMinutes: service.duration_minutes ? String(service.duration_minutes) : "",
    });
    setErrors({});
    setDialogOpen(true);
  };

  const updateFormField = <TKey extends keyof FormState>(key: TKey, value: FormState[TKey]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name") {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
    if (key === "price") {
      setErrors((prev) => ({ ...prev, price: undefined }));
    }
    if (key === "durationMinutes") {
      setErrors((prev) => ({ ...prev, durationMinutes: undefined }));
    }
  };

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    const nextErrors: FormErrors = {};
    if (!trimmedName) {
      nextErrors.name = "Service name is required.";
    }
    const parsedPrice = Number(form.price);
    if (!Number.isFinite(parsedPrice)) {
      nextErrors.price = "Service price must be a valid number.";
    } else if (parsedPrice <= 0) {
      nextErrors.price = "Service price must be greater than zero.";
    }

    const parsedDuration = form.durationMinutes.trim() ? Number(form.durationMinutes) : null;
    if (parsedDuration != null && !Number.isInteger(parsedDuration)) {
      nextErrors.durationMinutes = "Duration must be a whole number.";
    } else if (parsedDuration != null && parsedDuration <= 0) {
      nextErrors.durationMinutes = "Duration must be greater than zero.";
    }

    if (nextErrors.name || nextErrors.price || nextErrors.durationMinutes) {
      setErrors(nextErrors);
      toast.error("Fix the highlighted service fields.");
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        sku: form.sku.trim() || null,
        price: parsedPrice,
        description: form.description.trim() || null,
        category_id: form.categoryId === "none" ? null : form.categoryId,
        duration_minutes: parsedDuration,
      };

      const saved = editingService
        ? await updateService(editingService.id, payload)
        : await createService(payload);

      setServices((prev) => {
        const index = prev.findIndex((item) => item.id === saved.id);
        if (index < 0) {
          return [saved, ...prev];
        }

        return prev.map((item) => (item.id === saved.id ? saved : item));
      });

      toast.success(editingService ? "Service updated." : "Service created.");
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (service: Service) => {
    setDeletingId(service.id);
    try {
      await deleteService(service.id);
      setServices((prev) => prev.filter((item) => item.id !== service.id));
      toast.success("Service deactivated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate service.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (service: Service, nextActive: boolean) => {
    setDeletingId(service.id);
    try {
      const updated = await updateService(service.id, { is_active: nextActive });
      setServices((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success(nextActive ? "Service activated." : "Service deactivated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update service status.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">Services</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage non-inventory service items sold in POS checkout.
              </p>
            </div>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </div>

          <div className="relative max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, SKU, category..."
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label htmlFor="services-include-inactive">Show inactive services</Label>
            <Switch
              id="services-include-inactive"
              checked={includeInactive}
              onCheckedChange={setIncludeInactive}
            />
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading services...
                    </TableCell>
                  </TableRow>
                ) : filteredServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No services match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServices.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="max-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <Wrench className="h-4 w-4 shrink-0 text-emerald-600" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{service.name}</div>
                            {service.description ? (
                              <div className="truncate text-xs text-muted-foreground">{service.description}</div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{service.sku || "-"}</TableCell>
                      <TableCell>{service.category_name || "-"}</TableCell>
                      <TableCell className="text-right font-medium">{currencyFormatter.format(service.price)}</TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={() => openEditDialog(service)}>
                            <PencilLine className="h-4 w-4" />
                            Edit
                          </Button>
                          {service.is_active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={deletingId === service.id}
                              onClick={() => {
                                void handleDelete(service);
                              }}
                            >
                              {deletingId === service.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingId === service.id}
                              onClick={() => {
                                void handleToggleActive(service, true);
                              }}
                            >
                              {deletingId === service.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Activate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit service" : "Add service"}</DialogTitle>
            <DialogDescription>
              Services are sold at checkout without inventory deduction.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="service-name">Name</Label>
              <Input
                id="service-name"
                value={form.name}
                onChange={(event) => updateFormField("name", event.target.value)}
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="service-sku">SKU</Label>
                <Input
                  id="service-sku"
                  value={form.sku}
                  onChange={(event) => updateFormField("sku", event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="service-price">Price</Label>
                <Input
                  id="service-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => updateFormField("price", event.target.value)}
                  className={errors.price ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                {errors.price ? <p className="text-xs text-destructive">{errors.price}</p> : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(value) => updateFormField("categoryId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {activeCategories.map((category) => (
                      <SelectItem key={category.category_id} value={category.category_id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="service-duration">Duration (minutes)</Label>
                <Input
                  id="service-duration"
                  inputMode="numeric"
                  value={form.durationMinutes}
                  onChange={(event) => updateFormField("durationMinutes", event.target.value)}
                  className={errors.durationMinutes ? "border-destructive focus-visible:ring-destructive" : undefined}
                />
                {errors.durationMinutes ? (
                  <p className="text-xs text-destructive">{errors.durationMinutes}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="service-description">Description</Label>
              <Textarea
                id="service-description"
                rows={4}
                value={form.description}
                onChange={(event) => updateFormField("description", event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
