import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PauseCircle, Play, Trash2, ShoppingCart } from "lucide-react";
import type { HeldBill } from "./types";

interface HeldBillsDrawerProps {
  open: boolean;
  onClose: () => void;
  heldBills: HeldBill[];
  onResume: (billId: string) => void;
  onDelete: (billId: string) => void;
}

const HeldBillsDrawer = ({
  open,
  onClose,
  heldBills,
  onResume,
  onDelete,
}: HeldBillsDrawerProps) => {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-warning" />
            Held Bills ({heldBills.length})
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 overflow-y-auto scrollbar-thin max-h-[calc(100vh-120px)]">
          {heldBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <ShoppingCart className="h-10 w-10 opacity-30" />
              <p className="text-sm">No held bills</p>
            </div>
          ) : (
            heldBills.map((bill) => {
              const total = bill.items.reduce(
                (acc, i) => acc + i.product.price * i.quantity,
                0
              );
              const itemCount = bill.items.reduce(
                (acc, i) => acc + i.quantity,
                0
              );

              return (
                <div
                  key={bill.id}
                  className="p-4 bg-card rounded-xl border border-border pos-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {bill.label || `Bill #${bill.id.slice(0, 6)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {itemCount} items · Rs. {total.toLocaleString()}
                      </p>
                      {bill.customerMobile && (
                        <p className="text-xs text-muted-foreground">
                          📱 {bill.customerMobile}
                        </p>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(bill.heldAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="pos-primary"
                      className="flex-1 rounded-lg"
                      onClick={() => {
                        onResume(bill.id);
                        onClose();
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="pos-danger"
                      className="rounded-lg"
                      onClick={() => onDelete(bill.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HeldBillsDrawer;
