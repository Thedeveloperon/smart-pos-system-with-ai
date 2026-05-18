export const INVENTORY_REFRESH_EVENT = "smartpos:inventory-updated";

export function notifyInventoryRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(INVENTORY_REFRESH_EVENT));
}
