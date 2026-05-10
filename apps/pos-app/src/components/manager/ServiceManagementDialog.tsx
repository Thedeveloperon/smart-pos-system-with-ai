import { useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

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

const DECIMAL_INPUT_PATTERN = /^(?:\d+\.?\d*|\.\d+)$/;

const validateServicePrice = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || !DECIMAL_INPUT_PATTERN.test(trimmed)) {
    return {
      parsedPrice: null,
      error: "Enter a valid service price.",
    };
  }

  const parsedPrice = Number(trimmed);
  if (!Number.isFinite(parsedPrice)) {
    return {
      parsedPrice: null,
      error: "Enter a valid service price.",
    };
  }

  if (parsedPrice <= 0) {
    return {
      parsedPrice,
      error: "Service price must be greater than 0.",
    };
  }

  return {
    parsedPrice,
    error: null,
  };
};

const validateServiceDuration = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      parsedDuration: null,
      error: null,
    };
  }

  const parsedDuration = Number(trimmed);
  if (!Number.isFinite(parsedDuration) || !Number.isInteger(parsedDuration) || parsedDuration <= 0) {
    return {
      parsedDuration: null,
      error: "Service duration must be a whole number greater than 0.",
    };
  }

  return {
    parsedDuration,
    error: null,
  };
};

export default function ServiceManagementDialog({ open, service, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const durationInputRef = useRef<HTMLInputElement>(null);

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
      setNameError(null);
      setPriceError(null);
      setDurationError(null);
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
    setNameError(null);
    setPriceError(null);
    setDurationError(null);
  }, [open, service]);

  const categoryOptions = useMemo(
    () => categories.filter((item) => item.is_active),
    [categories],
  );

  const handleSave = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      const message = "Service name is required.";
      setNameError(message);
      toast.error(message);
      nameInputRef.current?.focus();
      return;
    }
    setNameError(null);

    const { parsedPrice, error: priceValidationMessage } = validateServicePrice(form.price);
    if (priceValidationMessage) {
      setPriceError(priceValidationMessage);
      toast.error(priceValidationMessage);
      priceInputRef.current?.focus();
      return;
    }
    setPriceError(null);

    const { parsedDuration, error: durationValidationMessage } = validateServiceDuration(form.durationMinutes);
    if (durationValidationMessage) {
      setDurationError(durationValidationMessage);
      toast.error(durationValidationMessage);
      durationInputRef.current?.focus();
      return;
    }
    setDurationError(null);

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
      toast.success(service ? "Service updated." : "Service created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save service.");
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
            <Label htmlFor="service-name" className={cn(nameError && "text-destructive")}>Name</Label>
            <Input
              id="service-name"
              ref={nameInputRef}
              value={form.name}
              onChange={(event) => {
                const nextName = event.target.value;
                setForm((prev) => ({ ...prev, name: nextName }));
                if (nameError) {
                  setNameError(nextName.trim() ? null : "Service name is required.");
                }
              }}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "service-name-error" : undefined}
              className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
            />
            {nameError ? (
              <p id="service-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            ) : null}
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
              <Label htmlFor="service-price" className={cn(priceError && "text-destructive")}>
                Default Price
              </Label>
              <Input
                id="service-price"
                ref={priceInputRef}
                inputMode="decimal"
                value={form.price}
                onChange={(event) => {
                  const nextPrice = event.target.value;
                  setForm((prev) => ({ ...prev, price: nextPrice }));
                  if (priceError) {
                    setPriceError(validateServicePrice(nextPrice).error);
                  }
                }}
                aria-invalid={Boolean(priceError)}
                aria-describedby={priceError ? "service-price-error" : undefined}
                className={cn(priceError && "border-destructive focus-visible:ring-destructive")}
              />
              {priceError ? (
                <p id="service-price-error" className="text-sm text-destructive">
                  {priceError}
                </p>
              ) : null}
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
              <Label htmlFor="service-duration" className={cn(durationError && "text-destructive")}>
                Duration (minutes)
              </Label>
              <Input
                id="service-duration"
                ref={durationInputRef}
                inputMode="numeric"
                value={form.durationMinutes}
                onChange={(event) => {
                  const nextDuration = event.target.value;
                  setForm((prev) => ({ ...prev, durationMinutes: nextDuration }));
                  if (durationError) {
                    setDurationError(validateServiceDuration(nextDuration).error);
                  }
                }}
                aria-invalid={Boolean(durationError)}
                aria-describedby={durationError ? "service-duration-error" : undefined}
                className={cn(durationError && "border-destructive focus-visible:ring-destructive")}
              />
              {durationError ? (
                <p id="service-duration-error" className="text-sm text-destructive">
                  {durationError}
                </p>
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
