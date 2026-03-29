import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Printer,
  MessageCircle,
  Banknote,
  CreditCard,
  QrCode,
  Receipt,
} from "lucide-react";
import type { RecentSale } from "./types";

interface RecentSalesPanelProps {
  open: boolean;
  onClose: () => void;
  sales: RecentSale[];
  onReprint: (saleId: string) => void;
  onWhatsApp: (saleId: string) => void;
}

const PaymentIcon = ({ method }: { method: string }) => {
  switch (method) {
    case "cash":
      return <Banknote className="h-3.5 w-3.5" />;
    case "card":
      return <CreditCard className="h-3.5 w-3.5" />;
    case "qr":
      return <QrCode className="h-3.5 w-3.5" />;
    default:
      return null;
  }
};

const RecentSalesPanel = ({
  open,
  onClose,
  sales,
  onReprint,
  onWhatsApp,
}: RecentSalesPanelProps) => {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Sales ({sales.length})
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 overflow-y-auto scrollbar-thin max-h-[calc(100vh-120px)]">
          {sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Receipt className="h-10 w-10 opacity-30" />
              <p className="text-sm">No recent sales</p>
            </div>
          ) : (
            sales.map((sale) => {
              const itemCount = sale.items.reduce(
                (a, i) => a + i.quantity,
                0
              );

              return (
                <div
                  key={sale.id}
                  className="p-4 bg-card rounded-xl border border-border pos-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold">
                        Sale #{sale.id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {itemCount} items
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">
                        Rs. {sale.total.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <PaymentIcon method={sale.paymentMethod} />
                        <span className="capitalize">{sale.paymentMethod}</span>
                      </div>
                    </div>
                  </div>

                  {sale.customerMobile && (
                    <Badge variant="secondary" className="text-[11px] mb-2">
                      📱 {sale.customerMobile}
                    </Badge>
                  )}

                  <p className="text-[11px] text-muted-foreground mb-3">
                    {new Date(sale.completedAt).toLocaleString()}
                  </p>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-lg"
                      onClick={() => onReprint(sale.id)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Reprint
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-lg"
                      onClick={() => onWhatsApp(sale.id)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
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

export default RecentSalesPanel;
