import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PauseCircle,
  Clock,
  LogOut,
  User,
  FileText,
  BarChart3,
  Upload,
  Settings2,
  KeyRound,
  Menu,
  Bell,
  Boxes,
} from "lucide-react";

interface HeaderBarProps {
  cashierName: string;
  heldBillsCount: number;
  onHeldBills: () => void;
  onTodaySales: () => void;
  onInventoryManager?: () => void;
  inventoryAlertCount?: number;
  onReports?: () => void;
  onImportSupplierBill: () => void;
  onAiInsights?: () => void;
  aiCredits?: number | null;
  isAiCreditLow?: boolean;
  cloudPortalUrl?: string;
  onReminders?: () => void;
  openReminderCount?: number;
  todayIssueCount?: number;
  onShopSettings?: () => void;
  onMyAccountLicenses?: () => void;
  onSyncOffline?: () => void;
  offlinePendingCount?: number;
  isOfflineSyncing?: boolean;
  onSignOut: () => void;
  onAuditLog?: () => void;
  onEndShift?: () => void;
  isAdmin?: boolean;
  hasActiveSession?: boolean;
  cashierToolbarVisibility?: {
    manage?: boolean;
    inventoryManager?: boolean;
    reports?: boolean;
    aiInsights?: boolean;
    heldBills?: boolean;
    reminders?: boolean;
    auditTrail?: boolean;
    endShift?: boolean;
    todaySales?: boolean;
    importBill?: boolean;
    shopSettings?: boolean;
    myLicenses?: boolean;
    sync?: boolean;
  };
}

const HeaderBar = ({
  cashierName,
  heldBillsCount,
  onHeldBills,
  onTodaySales,
  onInventoryManager,
  inventoryAlertCount = 0,
  onReports,
  onImportSupplierBill,
  onReminders,
  openReminderCount = 0,
  todayIssueCount = 0,
  onShopSettings,
  onMyAccountLicenses,
  onSignOut,
  onAuditLog,
  onEndShift,
  isAdmin = false,
  hasActiveSession = false,
  cashierToolbarVisibility,
}: HeaderBarProps) => {
  const isCashier = !isAdmin;
  const allowCashier = (visible?: boolean) => !isCashier || visible !== false;
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const openSignOutConfirm = () => setShowSignOutConfirm(true);

  return (
    <header className="mx-2 mt-2 flex h-14 shrink-0 items-center justify-between gap-3 border border-border/60 bg-pos-header/95 px-4 text-pos-header-foreground backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="Open Lanka POS logo" className="h-10 w-auto object-contain" />
      </div>

      <div className="hidden xl:flex items-center gap-2">
        {allowCashier(cashierToolbarVisibility?.heldBills) && (
          <Button
          variant="ghost"
          size="sm"
          onClick={onHeldBills}
          className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
        >
          <PauseCircle className="h-4 w-4" />
          <span className="hidden md:inline ml-1">Held</span>
          {heldBillsCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-warning text-warning-foreground">
              {heldBillsCount}
            </Badge>
          )}
          </Button>
        )}

        {onInventoryManager && allowCashier(cashierToolbarVisibility?.inventoryManager) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onInventoryManager}
            className="relative text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Boxes className="h-4 w-4" />
            <span className="hidden md:inline ml-1">POS Management</span>
            {inventoryAlertCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-red-500 text-white rounded-full">
                {inventoryAlertCount}
              </Badge>
            )}
          </Button>
        )}

        {onReports && allowCashier(cashierToolbarVisibility?.reports) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReports}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Reports</span>
          </Button>
        )}

        {onReminders && allowCashier(cashierToolbarVisibility?.reminders) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReminders}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Reminders</span>
            {openReminderCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-amber-500 text-white">
                {openReminderCount > 99 ? "99+" : openReminderCount}
              </Badge>
            )}
          </Button>
        )}

        {allowCashier(cashierToolbarVisibility?.todaySales) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTodaySales}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Today</span>
            {todayIssueCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full border border-destructive/30 bg-destructive text-[10px] text-destructive-foreground shadow-sm">
                {todayIssueCount > 99 ? "99+" : todayIssueCount}
              </Badge>
            )}
          </Button>
        )}

        {onAuditLog && allowCashier(cashierToolbarVisibility?.auditTrail) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAuditLog}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Audit</span>
          </Button>
        )}

        {allowCashier(cashierToolbarVisibility?.importBill) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onImportSupplierBill}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Import Bill</span>
          </Button>
        )}

        {onShopSettings && allowCashier(cashierToolbarVisibility?.shopSettings) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShopSettings}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Shop</span>
          </Button>
        )}

        {onMyAccountLicenses && allowCashier(cashierToolbarVisibility?.myLicenses) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMyAccountLicenses}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <KeyRound className="h-4 w-4" />
            <span className="hidden md:inline ml-1">My Licenses</span>
          </Button>
        )}

        <div className="h-6 w-px bg-pos-header-foreground/20 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2 text-sm text-pos-header-foreground/80">
          <User className="h-4 w-4" />
          <span className="hidden lg:inline">{cashierName}</span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={openSignOutConfirm}
          aria-label="Sign out"
          className="text-pos-header-foreground hover:bg-destructive/20 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex xl:hidden items-center gap-2">
        <div className="h-6 w-px bg-pos-header-foreground/20 hidden sm:block" />

        <div className="flex items-center gap-2 text-sm text-pos-header-foreground/80">
          <User className="h-4 w-4" />
          <span className="hidden lg:inline">{cashierName}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 rounded-xl border-border/70 bg-surface-elevated p-2">
            {allowCashier(cashierToolbarVisibility?.heldBills) && (
              <DropdownMenuItem onSelect={() => onHeldBills()} className="min-h-11 px-3 py-2 text-base">
                <PauseCircle className="mr-3 h-5 w-5" />
                Held
                {heldBillsCount > 0 && <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">{heldBillsCount}</Badge>}
              </DropdownMenuItem>
            )}

            {onInventoryManager && allowCashier(cashierToolbarVisibility?.inventoryManager) && (
              <DropdownMenuItem onSelect={() => onInventoryManager()} className="min-h-11 px-3 py-2 text-base">
                <Boxes className="mr-3 h-5 w-5" />
                POS Management
                {inventoryAlertCount > 0 && (
                  <Badge className="ml-auto h-5 min-w-5 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                    {inventoryAlertCount}
                  </Badge>
                )}
              </DropdownMenuItem>
            )}

            {onReports && allowCashier(cashierToolbarVisibility?.reports) && (
              <DropdownMenuItem onSelect={() => onReports()} className="min-h-11 px-3 py-2 text-base">
                <BarChart3 className="mr-3 h-5 w-5" />
                Reports
              </DropdownMenuItem>
            )}

            {onReminders && allowCashier(cashierToolbarVisibility?.reminders) && (
              <DropdownMenuItem onSelect={() => onReminders()} className="min-h-11 px-3 py-2 text-base">
                <Bell className="mr-3 h-5 w-5" />
                Reminders
                {openReminderCount > 0 && (
                  <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">
                    {openReminderCount > 99 ? "99+" : openReminderCount}
                  </Badge>
                )}
              </DropdownMenuItem>
            )}

            {allowCashier(cashierToolbarVisibility?.todaySales) && (
              <DropdownMenuItem onSelect={() => onTodaySales()} className="min-h-11 px-3 py-2 text-base">
                <Clock className="mr-3 h-5 w-5" />
                Today
                {todayIssueCount > 0 && (
                  <Badge className="ml-auto h-5 min-w-5 rounded-full border border-destructive/30 bg-destructive px-1.5 text-[10px] text-destructive-foreground shadow-sm">
                    {todayIssueCount > 99 ? "99+" : todayIssueCount}
                  </Badge>
                )}
              </DropdownMenuItem>
            )}

            {onAuditLog && allowCashier(cashierToolbarVisibility?.auditTrail) && (
              <DropdownMenuItem onSelect={() => onAuditLog()} className="min-h-11 px-3 py-2 text-base">
                <FileText className="mr-3 h-5 w-5" />
                Audit
              </DropdownMenuItem>
            )}

            {allowCashier(cashierToolbarVisibility?.importBill) && (
              <DropdownMenuItem onSelect={() => onImportSupplierBill()} className="min-h-11 px-3 py-2 text-base">
                <Upload className="mr-3 h-5 w-5" />
                Import Bill
              </DropdownMenuItem>
            )}

            {onShopSettings && allowCashier(cashierToolbarVisibility?.shopSettings) && (
              <DropdownMenuItem onSelect={() => onShopSettings()} className="min-h-11 px-3 py-2 text-base">
                <Settings2 className="mr-3 h-5 w-5" />
                Shop
              </DropdownMenuItem>
            )}

            {onMyAccountLicenses && allowCashier(cashierToolbarVisibility?.myLicenses) && (
              <DropdownMenuItem onSelect={() => onMyAccountLicenses()} className="min-h-11 px-3 py-2 text-base">
                <KeyRound className="mr-3 h-5 w-5" />
                My Licenses
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openSignOutConfirm();
              }}
              className="min-h-11 px-3 py-2 text-base"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmationDialog
        open={showSignOutConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setShowSignOutConfirm(false);
          }
        }}
        title="Sign out?"
        description="Are you sure you want to sign out of this session?"
        cancelLabel="Cancel"
        confirmLabel="Sign Out"
        confirmVariant="destructive"
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          onSignOut();
        }}
      />
    </header>
  );
};

export default HeaderBar;
