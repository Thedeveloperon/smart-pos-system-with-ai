type MarketingEventPayload = Record<string, string | number | boolean | null | undefined>;

type WindowWithDataLayer = Window & {
  dataLayer?: Array<Record<string, unknown>>;
};

export function trackMarketingEvent(eventName: string, payload: MarketingEventPayload = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const eventPayload = {
    event: eventName,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("smartpos:marketing-event", { detail: eventPayload }));

  const windowWithDataLayer = window as WindowWithDataLayer;
  if (Array.isArray(windowWithDataLayer.dataLayer)) {
    windowWithDataLayer.dataLayer.push(eventPayload);
  }
}
