"use client";

import { useEffect } from "react";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";

const ServiceWorkerRegistrationEnabled =
  (process.env.NEXT_PUBLIC_PWA_SERVICE_WORKER_ENABLED || "true")
    .trim()
    .toLowerCase() === "true";

export default function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!ServiceWorkerRegistrationEnabled || typeof window === "undefined") {
      return;
    }

    if (!("serviceWorker" in navigator)) {
      return;
    }

    let updateIntervalId: ReturnType<typeof setInterval> | null = null;
    const registerWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/",
        });

        const handleInstallingWorker = (worker: ServiceWorker | null) => {
          if (!worker) {
            return;
          }

          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              trackMarketingEvent("marketing_pwa_sw_update_ready", {
                scope: registration.scope,
              });
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        };

        if (registration.installing) {
          handleInstallingWorker(registration.installing);
        }

        registration.addEventListener("updatefound", () => {
          handleInstallingWorker(registration.installing);
        });

        updateIntervalId = setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);

        trackMarketingEvent("marketing_pwa_sw_registered", { scope: registration.scope });
      } catch {
        // Best-effort registration; do not block page rendering.
      }
    };

    void registerWorker();

    const onControllerChanged = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChanged);

    const onBeforeInstallPrompt = () => {
      trackMarketingEvent("marketing_pwa_install_prompt_available", { source: "global" });
    };
    const onAppInstalled = () => {
      trackMarketingEvent("marketing_pwa_installed", { source: "global" });
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      if (updateIntervalId) {
        clearInterval(updateIntervalId);
      }

      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChanged);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  return null;
}
