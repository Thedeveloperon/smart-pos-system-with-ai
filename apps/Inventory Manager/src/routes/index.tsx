import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import PosHome from "@/pages/PosHome";
import InventoryPage from "@/pages/InventoryPage";
import ReportsPage from "@/pages/ReportsPage";
import ManagerPage from "@/pages/ManagerPage";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [view, setView] = useState<"pos" | "inventory" | "reports" | "manager">("inventory");

  if (view === "inventory") return <InventoryPage onBack={() => setView("pos")} />;
  if (view === "reports") return <ReportsPage onBack={() => setView("pos")} />;
  if (view === "manager") return <ManagerPage onBack={() => setView("pos")} />;
  return (
    <PosHome
      onOpenInventory={() => setView("inventory")}
      onOpenReports={() => setView("reports")}
      onOpenManager={() => setView("manager")}
    />
  );
}
