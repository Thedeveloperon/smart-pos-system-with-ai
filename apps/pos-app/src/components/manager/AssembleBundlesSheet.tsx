import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assembleBundles, type Bundle } from "@/lib/api";

type Props = {
  open: boolean;
  bundle: Bundle | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (bundle: Bundle) => void;
};

export default function AssembleBundlesSheet({ open, bundle, onOpenChange, onSaved }: Props) {
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!bundle) {
      return;
    }

    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Quantity must be greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const updated = await assembleBundles(bundle.id, parsed);
      onSaved(updated);
      onOpenChange(false);
      toast.success("Bundles assembled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assemble bundles.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assemble Bundles</SheetTitle>
          <SheetDescription>
            Assemble {bundle?.name ?? "bundle"} from its component product stock.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4 space-y-2">
          <Label>Quantity</Label>
          <Input type="number" min={0} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Assemble"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
