import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createService, fetchCategories, type Category, type Service, updateService } from "@/lib/api";

type Props = {
  open: boolean;
  service: Service | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (service: Service) => void;
};

type FormState = {
  name: string;
  sku: string;
  price: string;
  description: string;
  categoryId: string;
  durationMinutes: string;
};

const emptyForm = (): FormState => ({
  name: "",
  sku: "",
  price: "",
  description: "",
  categoryId: "none",
  durationMinutes: "",
});

export default function ServiceManagementDialog({ open, service, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    void fetchCategories(true)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!service) {
      setForm(emptyForm());
      return;
    }

    setForm({
      name: service.name,
      sku: service.sku ?? "",
      price: String(service.price),
      description: service.description ?? "",
      categoryId: service.category_id ?? "none",
      durationMinutes: service.duration_minutes ? String(service.duration_minutes) : "",
    });
  }, [open, service]);

  const categoryOptions = useMemo(
    () => categories.filter((item) => item.is_active),
    [categories],
  );

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      return;
    }

    const parsedPrice = Number(form.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return;
    }

    const parsedDuration = form.durationMinutes.trim()
      ? Number(form.durationMinutes)
      : null;

    if (parsedDuration != null && (!Number.isInteger(parsedDuration) || parsedDuration <= 0)) {
      return;
    }

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

      const saved = service
        ? await updateService(service.id, payload)
        : await createService(payload);
      onSaved(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{service ? "Edit Service" : "New Service"}</DialogTitle>
          <DialogDescription>
            Services are non-inventory items sold directly at checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="service-sku">SKU</Label>
              <Input
                id="service-sku"
                value={form.sku}
                onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="service-price">Default Price</Label>
              <Input
                id="service-price"
                inputMode="decimal"
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categoryOptions.map((category) => (
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
                onChange={(event) => setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="service-description">Description</Label>
            <Textarea
              id="service-description"
              rows={4}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
