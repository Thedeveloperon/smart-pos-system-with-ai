import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Lock,
  PlusCircle,
  BarChart3,
  Upload,
  Settings2,
  PencilLine,
  CloudUpload,
  Loader2,
  KeyRound,
  Menu,
  Sparkles,
  Bell,
} from "lucide-react";

interface HeaderBarProps {
  cashierName: string;
  heldBillsCount: number;
  onHeldBills: () => void;
  onTodaySales: () => void;
  onNewItem: () => void;
  onManageProducts?: () => void;
  onReports?: () => void;
  onImportSupplierBill: () => void;
  onAiInsights?: () => void;
  aiCredits?: number | null;
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
}

const HeaderBar = ({
  cashierName,
  heldBillsCount,
  onHeldBills,
  onTodaySales,
  onNewItem,
  onManageProducts,
  onReports,
  onImportSupplierBill,
  onAiInsights,
  aiCredits = null,
  onReminders,
  openReminderCount = 0,
  todayIssueCount = 0,
  onShopSettings,
  onMyAccountLicenses,
  onSyncOffline,
  offlinePendingCount = 0,
  isOfflineSyncing = false,
  onSignOut,
  onAuditLog,
  onEndShift,
  isAdmin = false,
  hasActiveSession = false,
}: HeaderBarProps) => {
  return (
    <header className="bg-pos-header text-pos-header-foreground h-14 flex items-center justify-between px-4 gap-3 shrink-0">
      <div className="flex items-center">
        <img src="/logo.png" alt="SmartPOS Lanka logo" className="h-10 w-auto object-contain" />
      </div>

      <div className="hidden xl:flex items-center gap-2">
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

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewItem}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden md:inline ml-1">New Item</span>
          </Button>
        )}

        {isAdmin && onManageProducts && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onManageProducts}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <PencilLine className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Manage</span>
          </Button>
        )}

        {isAdmin && onReports && (
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

        {isAdmin && onAiInsights && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAiInsights}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden md:inline ml-1">AI Insights</span>
            {aiCredits !== null && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-emerald-500 text-white">
                {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
              </Badge>
            )}
          </Button>
        )}

        {onReminders && (
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

        {isAdmin && (
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

        {onAuditLog && (
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

        {hasActiveSession && onEndShift && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEndShift}
            className="text-pos-header-foreground hover:bg-destructive/20 hover:text-destructive"
          >
            <Lock className="h-4 w-4" />
            <span className="hidden md:inline ml-1">End Shift</span>
          </Button>
        )}

        {isAdmin && (
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

        {isAdmin && onShopSettings && (
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

        {isAdmin && onMyAccountLicenses && (
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

        {onSyncOffline && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSyncOffline}
            disabled={isOfflineSyncing}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
          >
            {isOfflineSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            <span className="hidden md:inline ml-1">Sync</span>
            {offlinePendingCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 flex items-center justify-center text-[10px] bg-warning text-warning-foreground">
                {offlinePendingCount > 99 ? "99+" : offlinePendingCount}
              </Badge>
            )}
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
          onClick={onSignOut}
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
          <DropdownMenuContent align="end" className="w-72 p-2">
            <DropdownMenuItem onSelect={() => onHeldBills()} className="min-h-11 px-3 py-2 text-base">
              <PauseCircle className="mr-3 h-5 w-5" />
              Held
              {heldBillsCount > 0 && <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">{heldBillsCount}</Badge>}
            </DropdownMenuItem>

            {isAdmin && (
              <DropdownMenuItem onSelect={() => onNewItem()} className="min-h-11 px-3 py-2 text-base">
                <PlusCircle className="mr-3 h-5 w-5" />
                New Item
              </DropdownMenuItem>
            )}

            {isAdmin && onManageProducts && (
              <DropdownMenuItem onSelect={() => onManageProducts()} className="min-h-11 px-3 py-2 text-base">
                <PencilLine className="mr-3 h-5 w-5" />
                Manage
              </DropdownMenuItem>
            )}

            {isAdmin && onReports && (
              <DropdownMenuItem onSelect={() => onReports()} className="min-h-11 px-3 py-2 text-base">
                <BarChart3 className="mr-3 h-5 w-5" />
                Reports
              </DropdownMenuItem>
            )}

            {isAdmin && onAiInsights && (
              <DropdownMenuItem onSelect={() => onAiInsights()} className="min-h-11 px-3 py-2 text-base">
                <Sparkles className="mr-3 h-5 w-5" />
                AI Insights
                {aiCredits !== null && (
                  <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">
                    {aiCredits > 999 ? "999+" : aiCredits.toFixed(0)}
                  </Badge>
                )}
              </DropdownMenuItem>
            )}

            {onReminders && (
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

            {isAdmin && (
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

            {onAuditLog && (
              <DropdownMenuItem onSelect={() => onAuditLog()} className="min-h-11 px-3 py-2 text-base">
                <FileText className="mr-3 h-5 w-5" />
                Audit
              </DropdownMenuItem>
            )}

            {hasActiveSession && onEndShift && (
              <DropdownMenuItem onSelect={() => onEndShift()} className="min-h-11 px-3 py-2 text-base">
                <Lock className="mr-3 h-5 w-5" />
                End Shift
              </DropdownMenuItem>
            )}

            {isAdmin && (
              <DropdownMenuItem onSelect={() => onImportSupplierBill()} className="min-h-11 px-3 py-2 text-base">
                <Upload className="mr-3 h-5 w-5" />
                Import Bill
              </DropdownMenuItem>
            )}

            {isAdmin && onShopSettings && (
              <DropdownMenuItem onSelect={() => onShopSettings()} className="min-h-11 px-3 py-2 text-base">
                <Settings2 className="mr-3 h-5 w-5" />
                Shop
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => onSignOut()} className="min-h-11 px-3 py-2 text-base">
              <LogOut className="mr-3 h-5 w-5" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default HeaderBar;
