import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CreateCustomerRequest } from "@/lib/api";
import { X } from "lucide-react";

type PriceTierOption = {
  id: string;
  name: string;
  code: string;
  discountPercent: number;
};

type CustomerCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (request: CreateCustomerRequest) => Promise<void> | void;
  tiers?: PriceTierOption[];
};

const initialState = {
  name: "",
  code: "",
  idNumber: "",
  phone: "",
  email: "",
  address: "",
  dob: "",
  tierId: "none",
  fixedDiscount: "",
  creditLimit: "0",
  notes: "",
  tags: [] as string[],
  tagInput: "",
  isActive: true,
};

export default function CustomerCreateDialog({ open, onOpenChange, onCreate, tiers = [] }: CustomerCreateDialogProps) {
  const [name, setName] = useState(initialState.name);
  const [code, setCode] = useState(initialState.code);
  const [idNumber, setIdNumber] = useState(initialState.idNumber);
  const [phone, setPhone] = useState(initialState.phone);
  const [email, setEmail] = useState(initialState.email);
  const [address, setAddress] = useState(initialState.address);
  const [dob, setDob] = useState(initialState.dob);
  const [tierId, setTierId] = useState(initialState.tierId);
  const [fixedDiscount, setFixedDiscount] = useState(initialState.fixedDiscount);
  const [creditLimit, setCreditLimit] = useState(initialState.creditLimit);
  const [notes, setNotes] = useState(initialState.notes);
  const [tags, setTags] = useState<string[]>(initialState.tags);
  const [tagInput, setTagInput] = useState(initialState.tagInput);
  const [isActive, setIsActive] = useState(initialState.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    dob?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName("");
    setCode("");
    setIdNumber("");
    setPhone("");
    setEmail("");
    setAddress("");
    setDob("");
    setTierId("none");
    setFixedDiscount("");
    setCreditLimit("0");
    setNotes("");
    setTags([]);
    setTagInput("");
    setIsActive(true);
    setIsSubmitting(false);
    setFieldErrors({});
    setApiError(null);
  }, [open]);

  const clearApiError = () => {
    if (apiError) {
      setApiError(null);
    }
  };

  const addTag = () => {
    const normalizedTag = tagInput.trim();
    if (!normalizedTag || tags.includes(normalizedTag)) {
      return;
    }

    clearApiError();
    setTags((previous) => [...previous, normalizedTag]);
    setTagInput("");
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const errors: {
      name?: string;
      email?: string;
      phone?: string;
      dob?: string;
    } = {};

    if (!trimmedName) {
      errors.name = "Full name is required.";
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Enter a valid email address.";
    }
    if (trimmedPhone && !/^[+\d\s\-().]+$/.test(trimmedPhone)) {
      errors.phone = "Phone number may only contain digits, spaces, +, -, (, ).";
    }
    if (dob) {
      const selectedDate = new Date(dob);
      if (!Number.isNaN(selectedDate.getTime()) && selectedDate > new Date()) {
        errors.dob = "Date of birth cannot be in the future.";
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      clearApiError();
      return;
    }

    setFieldErrors({});
    clearApiError();
    setIsSubmitting(true);
    try {
      await onCreate({
        name: trimmedName,
        code: code.trim() || null,
        idNumber: idNumber.trim() || null,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        address: address.trim() || null,
        dateOfBirth: dob || null,
        priceTierId: tierId === "none" ? null : tierId,
        fixedDiscountPercent: fixedDiscount === "" ? null : Number(fixedDiscount),
        creditLimit: Number(creditLimit) || 0,
        notes: notes.trim() || null,
        tags,
        isActive,
      });
      onOpenChange(false);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Failed to create customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-4 w-[calc(100vw-2rem)] max-w-2xl translate-y-0 max-h-[calc(100vh-2rem)] overflow-y-auto sm:top-[50%] sm:w-full sm:translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Profile, tier, discount, credit and loyalty details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *">
            <>
              <Input
                value={name}
                onChange={(event) => {
                  clearApiError();
                  setFieldErrors((previous) => ({ ...previous, name: undefined }));
                  setName(event.target.value);
                }}
              />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </>
          </Field>
          <Field label="Code (auto if blank)">
            <Input
              value={code}
              onChange={(event) => {
                clearApiError();
                setCode(event.target.value);
              }}
              placeholder="C-0005"
            />
          </Field>
          <Field label="ID number" className="sm:col-span-2">
            <Input
              value={idNumber}
              onChange={(event) => {
                clearApiError();
                setIdNumber(event.target.value);
              }}
            />
          </Field>
          <Field label="Phone">
            <>
              <Input
                value={phone}
                onChange={(event) => {
                  clearApiError();
                  setFieldErrors((previous) => ({ ...previous, phone: undefined }));
                  setPhone(event.target.value);
                }}
              />
              {fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
            </>
          </Field>
          <Field label="Email">
            <>
              <Input
                type="email"
                value={email}
                onChange={(event) => {
                  clearApiError();
                  setFieldErrors((previous) => ({ ...previous, email: undefined }));
                  setEmail(event.target.value);
                }}
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input
              value={address}
              onChange={(event) => {
                clearApiError();
                setAddress(event.target.value);
              }}
            />
          </Field>
          <Field label="Date of birth">
            <>
              <Input
                type="date"
                value={dob}
                onChange={(event) => {
                  clearApiError();
                  setFieldErrors((previous) => ({ ...previous, dob: undefined }));
                  setDob(event.target.value);
                }}
              />
              {fieldErrors.dob && <p className="text-xs text-destructive">{fieldErrors.dob}</p>}
            </>
          </Field>
          <Field label="Price tier">
            <select
              value={tierId}
              onChange={(event) => {
                clearApiError();
                setTierId(event.target.value);
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="none">- None -</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} ({tier.discountPercent}%)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fixed discount % (override)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={fixedDiscount}
              onChange={(event) => {
                clearApiError();
                setFixedDiscount(event.target.value);
              }}
              placeholder="-"
            />
          </Field>
          <Field label="Credit limit (LKR)">
            <Input
              type="number"
              min={0}
              value={creditLimit}
              onChange={(event) => {
                clearApiError();
                setCreditLimit(event.target.value);
              }}
            />
          </Field>
          <Field label="Tags" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input p-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => {
                      clearApiError();
                      setTags((previous) => previous.filter((value) => value !== tag));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(event) => {
                  clearApiError();
                  setTagInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => {
                clearApiError();
                setNotes(event.target.value);
              }}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => {
                clearApiError();
                setIsActive(event.target.checked);
              }}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>
        <DialogFooter>
          {apiError && <p className="w-full text-sm text-destructive">{apiError}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isSubmitting}>
            Create customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
