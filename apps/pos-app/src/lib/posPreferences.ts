const QUICK_SALE_KEY = "smartpos-quick-sale-enabled";
const EXPERT_MODE_KEY = "smartpos-expert-mode-enabled";

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

export function isExpertModeEnabled() {
  if (!isStorageAvailable()) {
    return false;
  }

  return window.localStorage.getItem(EXPERT_MODE_KEY) === "true";
}

export function setExpertModeEnabled(enabled: boolean) {
  if (!isStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(EXPERT_MODE_KEY, String(enabled));
}
