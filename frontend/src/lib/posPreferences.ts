const QUICK_SALE_KEY = "smartpos-quick-sale-enabled";

function isStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isQuickSaleEnabled() {
  if (!isStorageAvailable()) {
    return false;
  }

  return window.localStorage.getItem(QUICK_SALE_KEY) === "true";
}

export function setQuickSaleEnabled(enabled: boolean) {
  if (!isStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(QUICK_SALE_KEY, String(enabled));
}
