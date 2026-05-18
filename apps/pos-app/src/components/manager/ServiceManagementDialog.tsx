import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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

type FormErrors = {
  name?: string;
  price?: string;
  durationMinutes?: string;
};

const PRICE_INPUT_PATTERN = /^(?:\d+\.?\d*|\.\d+)?$/;
const DURATION_INPUT_PATTERN = /^\d*$/;

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
  const [errors, setErrors] = useState<FormErrors>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [durationInputRejected, setDurationInputRejected] = useState(false);

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
      setErrors({});
      setDurationInputRejected(false);
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
    setErrors({});
    setDurationInputRejected(false);
  }, [open, service]);

  const categoryOptions = useMemo(
    () => categories.filter((item) => item.is_active),
    [categories],
  );

  const handlePriceChange = (value: string) => {
    if (value === "" || PRICE_INPUT_PATTERN.test(value)) {
      setForm((prev) => ({ ...prev, price: value }));
      if (errors.price) {
        setErrors((prev) => ({ ...prev, price: undefined }));
      }
      return;
    }

    setErrors((prev) => ({
      ...prev,
      price: "Service price must be a valid number greater than zero.",
    }));
    toast.error("Service price must be a valid number greater than zero.");
  };

  const handleDurationChange = (value: string) => {
    if (value === "" || DURATION_INPUT_PATTERN.test(value)) {
      setForm((prev) => ({ ...prev, durationMinutes: value }));
      setDurationInputRejected(false);
      if (errors.durationMinutes) {
        setErrors((prev) => ({ ...prev, durationMinutes: undefined }));
      }
      return;
    }

    setDurationInputRejected(true);
    setErrors((prev) => ({
      ...prev,
      durationMinutes: "Duration must be a positive whole number.",
    }));
    toast.error("Duration must be a positive whole number.");
  };

  const handleSave = async () => {
    const nextErrors: FormErrors = {};
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      nextErrors.name = "Service name is required.";
    }

    const normalizedPrice = form.price.trim();
    const parsedPrice = Number(normalizedPrice);
    if (
      !normalizedPrice ||
      !PRICE_INPUT_PATTERN.test(normalizedPrice) ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice <= 0
    ) {
      nextErrors.price = "Service price must be a valid number greater than zero.";
    }

    const normalizedDuration = form.durationMinutes.trim();
    const parsedDuration = normalizedDuration ? Number(normalizedDuration) : null;

    if (
      durationInputRejected ||
      parsedDuration != null &&
      (!DURATION_INPUT_PATTERN.test(normalizedDuration) ||
        !Number.isInteger(parsedDuration) ||
        parsedDuration <= 0)
    ) {
      nextErrors.durationMinutes = "Duration must be a positive whole number.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(
        nextErrors.price ??
          nextErrors.durationMinutes ??
          nextErrors.name ??
          "Fix the highlighted service fields.",
      );
      return;
    }

    setErrors({});
    setDurationInputRejected(false);
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
              onChange={(event) => {
                setForm((prev) => ({ ...prev, name: event.target.value }));
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              className={errors.name ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
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
                onChange={(event) => handlePriceChange(event.target.value)}
                className={errors.price ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {errors.price ? <p className="text-xs text-destructive">{errors.price}</p> : null}
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
                onChange={(event) => handleDurationChange(event.target.value)}
                className={
                  errors.durationMinutes ? "border-destructive focus-visible:ring-destructive" : undefined
                }
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
