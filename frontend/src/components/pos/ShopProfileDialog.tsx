import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchShopProfile, updateShopProfile, type ShopProfile } from "@/lib/api";
import { isQuickSaleEnabled, setQuickSaleEnabled } from "@/lib/posPreferences";
import { isConfirmationSoundEnabled, setConfirmationSoundEnabled } from "@/lib/sound";

interface ShopProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

const emptyProfile = (): ShopProfile => ({
  id: "",
  shopName: "SmartPOS Lanka",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  receiptFooter: "Thank you for shopping with us.",
  createdAt: "",
  updatedAt: null,
});

const ShopProfileDialog = ({ open, onOpenChange, onSaved }: ShopProfileDialogProps) => {
  const [profile, setProfile] = useState<ShopProfile>(emptyProfile);
  const [confirmationSoundEnabled, setConfirmationSoundEnabledState] = useState(true);
  const [quickSaleEnabled, setQuickSaleEnabledState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let alive = true;
    setIsLoading(true);
    setConfirmationSoundEnabledState(isConfirmationSoundEnabled());
    setQuickSaleEnabledState(isQuickSaleEnabled());

    void fetchShopProfile()
      .then((data) => {
        if (alive) {
          setProfile(data);
        }
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to load shop details.");
        if (alive) {
          setProfile(emptyProfile());
        }
      })
      .finally(() => {
        if (alive) {
          setIsLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [open]);

  const updateField = (field: keyof ShopProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!profile.shopName.trim()) {
      toast.error("Shop name is required.");
      return;
    }

    try {
      setIsSaving(true);
      const saved = await updateShopProfile({
        ...profile,
        shopName: profile.shopName.trim(),
        addressLine1: profile.addressLine1.trim(),
        addressLine2: profile.addressLine2.trim(),
        phone: profile.phone.trim(),
        email: profile.email.trim(),
        website: profile.website.trim(),
        logoUrl: profile.logoUrl.trim(),
        receiptFooter: profile.receiptFooter.trim(),
      });
      setProfile(saved);
      toast.success("Shop details saved.");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save shop details.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoundToggle = (enabled: boolean) => {
    setConfirmationSoundEnabledState(enabled);
    setConfirmationSoundEnabled(enabled);
  };

  const handleQuickSaleToggle = (enabled: boolean) => {
    setQuickSaleEnabledState(enabled);
    setQuickSaleEnabled(enabled);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Shop details</DialogTitle>
          <DialogDescription>
            These details are printed automatically on the customer bill after each completed sale.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="shop-name">Shop name</Label>
              <Input
                id="shop-name"
                value={profile.shopName}
                onChange={(event) => updateField("shopName", event.target.value)}
                placeholder="Your shop name"
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={profile.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  placeholder="0701234567"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="shop@example.com"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address-line-1">Address line 1</Label>
              <Input
                id="address-line-1"
                value={profile.addressLine1}
                onChange={(event) => updateField("addressLine1", event.target.value)}
                placeholder="Main street, Matugama"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address-line-2">Address line 2</Label>
              <Input
                id="address-line-2"
                value={profile.addressLine2}
                onChange={(event) => updateField("addressLine2", event.target.value)}
                placeholder="Optional branch, city, or note"
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={profile.website}
                  onChange={(event) => updateField("website", event.target.value)}
                  placeholder="www.yourshop.lk"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="logo-url">Logo URL</Label>
                <Input
                  id="logo-url"
                  value={profile.logoUrl}
                  onChange={(event) => updateField("logoUrl", event.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-footer">Receipt footer</Label>
              <Textarea
                id="receipt-footer"
                value={profile.receiptFooter}
                onChange={(event) => updateField("receiptFooter", event.target.value)}
                placeholder="Thank you for your visit."
                className="min-h-24"
              />
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Confirmation sounds</p>
                  <p className="text-xs text-muted-foreground">
                    Plays soft POS cues for cart add, cash count, and sale completion.
                  </p>
                </div>
                <Switch checked={confirmationSoundEnabled} onCheckedChange={handleSoundToggle} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Quick sale</p>
                  <p className="text-xs text-muted-foreground">
                    Skips the cash count dialog and fills the exact total for faster cash checkouts.
                  </p>
                </div>
                <Switch checked={quickSaleEnabled} onCheckedChange={handleQuickSaleToggle} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || isSaving}>
            {isSaving ? "Saving..." : "Save details"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShopProfileDialog;
