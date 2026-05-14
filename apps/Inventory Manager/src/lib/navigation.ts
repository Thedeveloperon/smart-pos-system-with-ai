const POS_RETURN_PARAM = "returnTo";

function getSearchReturnTarget() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawTarget = new URLSearchParams(window.location.search).get(POS_RETURN_PARAM)?.trim();
  if (!rawTarget) {
    return null;
  }

  try {
    const targetUrl = new URL(rawTarget, window.location.origin);
    if (targetUrl.origin !== window.location.origin) {
      return null;
    }

    const target = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return target === current ? null : target;
  } catch {
    return null;
  }
}

function getReferrerTarget() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const referrer = document.referrer?.trim();
  if (!referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(referrer);
    if (!["http:", "https:"].includes(referrerUrl.protocol)) {
      return null;
    }

    return referrerUrl.toString() === window.location.href ? null : referrerUrl.toString();
  } catch {
    return null;
  }
}

export function navigateBackToPos() {
  if (typeof window === "undefined") {
    return;
  }

  const searchReturnTarget = getSearchReturnTarget();
  if (searchReturnTarget) {
    window.location.assign(searchReturnTarget);
    return;
  }

  const referrerTarget = getReferrerTarget();
  if (referrerTarget) {
    window.location.assign(referrerTarget);
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign("/");
}
