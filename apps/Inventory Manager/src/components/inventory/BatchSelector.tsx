import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchProductBatches, type ProductBatch } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  productId: string;
  value?: string;
  onChange: (batchId: string) => void;
};

export default function BatchSelector({ productId, value, onChange }: Props) {
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setBatches([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchProductBatches(productId)
      .then((items) => {
        if (alive) {
          setBatches(items);
        }
      })
      .catch((error) => {
        if (alive) {
          setBatches([]);
          toast.error(error instanceof Error ? error.message : "Failed to load batches.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  return (
    <Select value={value} onValueChange={onChange} disabled={loading || batches.length === 0}>
      <SelectTrigger>
        <SelectValue placeholder={loading ? "Loading batches…" : "Select a batch"} />
      </SelectTrigger>
      <SelectContent>
        {batches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.batch_number} — {b.remaining_quantity} left
            {b.expiry_date ? ` · exp ${new Date(b.expiry_date).toLocaleDateString()}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
