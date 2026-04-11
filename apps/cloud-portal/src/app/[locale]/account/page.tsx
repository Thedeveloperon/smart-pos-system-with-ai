"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, CreditCard, Download, Eye, EyeOff, LogOut, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { trackMarketingEvent } from "@/lib/marketingAnalytics";

const AccountDeviceCodeStorageKey = "smartpos_marketing_account_device_code_v1";
const AccountAiPendingCheckoutReferenceStorageKey =
  "smartpos_marketing_account_ai_pending_checkout_reference_v1";
const AccountAiTopUpEnabled =
  (process.env.NEXT_PUBLIC_ACCOUNT_AI_TOPUP_ENABLED || "true")
    .trim()
    .toLowerCase() === "true";
const AccountAiManualFallbackEnabled =
  (process.env.NEXT_PUBLIC_ACCOUNT_AI_TOPUP_MANUAL_FALLBACK_ENABLED || "true")
    .trim()
    .toLowerCase() === "true";
const AiCheckoutPollingIntervalMs = process.env.NODE_ENV === "test" ? 40 : 2500;
const AiCheckoutPollingMaxAttempts = process.env.NODE_ENV === "test" ? 4 : 8;
const AiSupportEmail = "support@smartpos.lk";

type LicenseAccessSuccessResponse = {
  generated_at: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  subscription_status: string;
  plan: string;
  seat_limit: number;
  entitlement_state: string;
  can_activate: boolean;
  installer_download_url?: string | null;
  installer_download_expires_at?: string | null;
  installer_download_protected: boolean;
  installer_checksum_sha256?: string | null;
  activation_entitlement: {
    activation_entitlement_key: string;
    max_activations: number;
    activations_used: number;
    expires_at: string;
    status: string;
  };
};

type AuthSessionResponse = {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  device_id: string;
  device_code: string;
  expires_at: string;
  mfa_verified: boolean;
};

type CustomerLicensePortalResponse = {
  generated_at: string;
  shop_id: string;
  shop_code: string;
  shop_name: string;
  subscription_status: string;
  plan: string;
  seat_limit: number;
  active_seats: number;
  self_service_deactivation_limit_per_day: number;
  self_service_deactivations_used_today: number;
  self_service_deactivations_remaining_today: number;
  can_deactivate_more_devices_today: boolean;
  latest_activation_entitlement?: {
    activation_entitlement_key: string;
    max_activations: number;
    activations_used: number;
    expires_at: string;
  } | null;
  devices: Array<{
    provisioned_device_id: string;
    device_code: string;
    device_name: string;
    device_status: string;
    license_state: string;
    assigned_at: string;
    last_heartbeat_at?: string | null;
    valid_until?: string | null;
    grace_until?: string | null;
    is_current_device: boolean;
  }>;
};

type AiWalletResponse = {
  available_credits: number;
  updated_at: string;
};

type AiCreditPackResponse = {
  pack_code: string;
  credits: number;
  price: number;
  currency: string;
};

type AiCreditPackListResponse = {
  items: AiCreditPackResponse[];
};

type AiPaymentHistoryItemResponse = {
  payment_id: string;
  payment_status: string;
  payment_method: string;
  provider: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  created_at: string;
  completed_at?: string | null;
};

type AiPaymentHistoryResponse = {
  items: AiPaymentHistoryItemResponse[];
};

type AiCreditLedgerItemResponse = {
  entry_type: string;
  delta_credits: number;
  balance_after_credits: number;
  reference?: string | null;
  description?: string | null;
  created_at_utc: string;
};

type AiCreditLedgerResponse = {
  items: AiCreditLedgerItemResponse[];
};

type AiPendingManualPaymentItem = {
  payment_id: string;
  target_username: string;
  target_full_name?: string | null;
  shop_name?: string | null;
  payment_status: string;
  payment_method: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  submitted_reference?: string | null;
  created_at: string;
};

type AiPendingManualPaymentsResponse = {
  items: AiPendingManualPaymentItem[];
};

type AiCheckoutSessionResponse = {
  payment_id: string;
  payment_status: string;
  payment_method: string;
  provider: string;
  pack_code: string;
  credits: number;
  amount: number;
  currency: string;
  external_reference: string;
  checkout_url?: string | null;
  created_at: string;
};

type AiCheckoutMethod = "card" | "cash" | "bank_deposit";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function parseErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const candidate = payload as ApiErrorPayload;
  return (
    candidate?.error?.message?.trim() ||
    candidate?.message?.trim() ||
    "Request failed. Please try again."
  );
}

async function parseApiPayload(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

function requireObjectPayload<T>(payload: unknown, errorMessage: string): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(errorMessage);
  }

  return payload as T;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function isPastDate(value?: string | null) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getTime() <= Date.now();
}

function toSentence(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

function normalizePaymentStatus(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function isPaymentStatusProcessing(value?: string | null) {
  const normalizedStatus = normalizePaymentStatus(value);
  return (
    normalizedStatus === "pending" ||
    normalizedStatus === "processing" ||
    normalizedStatus === "action_required" ||
    normalizedStatus === "pending_verification"
  );
}

function resolvePaymentStatusGuidance(value?: string | null) {
  const normalizedStatus = normalizePaymentStatus(value);
  if (!normalizedStatus) {
    return "Payment status not available yet.";
  }

  switch (normalizedStatus) {
    case "processing":
    case "pending":
      return "Payment is still processing with the provider.";
    case "pending_verification":
      return "Manual payment submitted. Credits will be added after verification.";
    case "action_required":
      return "Additional payment action is required. Retry checkout to continue.";
    case "succeeded":
      return "Payment completed successfully and credits are available.";
    case "failed":
      return "Payment failed. Retry checkout or switch payment method.";
    case "canceled":
      return "Payment was canceled before completion.";
    case "refunded":
      return "Payment was refunded and credits were reversed.";
    default:
      return "Payment status updated. Refresh billing data if needed.";
  }
}

function buildAiSupportMailto(reference?: string | null) {
  const normalizedReference = (reference || "").trim() || "not_provided";
  const subject = encodeURIComponent("AI Credit Top-Up Support Request");
  const body = encodeURIComponent(
    `Please help with my AI credit payment.\nReference: ${normalizedReference}\nIssue: `,
  );
  return `mailto:${AiSupportEmail}?subject=${subject}&body=${body}`;
}

function formatCredits(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function formatAmount(value?: number | null, currency = "USD") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `- ${currency}`;
  }

  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function canAccessLicensePortal(role?: string | null) {
  const normalizedRole = (role || "").trim().toLowerCase();
  return normalizedRole === "owner" || normalizedRole === "manager";
}

const LicensePortalAccessDeniedMessage =
  "Your role cannot access license management. Sign in as owner or manager.";

function maskActivationKey(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= 8) {
    return "••••••••";
  }

  return `${normalized.slice(0, 4)}••••••${normalized.slice(-4)}`;
}

function generateAccountDeviceCode() {
  const randomPart = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `MKTWEB-${randomPart}`;
}

function resolveStoredAccountDeviceCode() {
  const existing = window.localStorage.getItem(AccountDeviceCodeStorageKey)?.trim();
  if (existing) {
    return existing;
  }

  const nextCode = generateAccountDeviceCode();
  window.localStorage.setItem(AccountDeviceCodeStorageKey, nextCode);
  return nextCode;
}

export default function AccountPage() {
  const { locale } = useI18n();

  const [activationKeyInput, setActivationKeyInput] = useState("");
  const [accessData, setAccessData] = useState<LicenseAccessSuccessResponse | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checksumCopied, setChecksumCopied] = useState(false);

  const [accountDeviceCode, setAccountDeviceCode] = useState("");
  const [authSession, setAuthSession] = useState<AuthSessionResponse | null>(null);
  const [portalData, setPortalData] = useState<CustomerLicensePortalResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMfaCode, setAuthMfaCode] = useState("");
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [deactivatingDeviceCode, setDeactivatingDeviceCode] = useState<string | null>(null);
  const [isLoadingAiBilling, setIsLoadingAiBilling] = useState(false);
  const [isCreatingAiCheckout, setIsCreatingAiCheckout] = useState(false);
  const [aiWallet, setAiWallet] = useState<AiWalletResponse | null>(null);
  const [aiCreditPacks, setAiCreditPacks] = useState<AiCreditPackResponse[]>([]);
  const [selectedAiPackCode, setSelectedAiPackCode] = useState("");
  const [aiPaymentHistory, setAiPaymentHistory] = useState<AiPaymentHistoryItemResponse[]>([]);
  const [aiCreditLedger, setAiCreditLedger] = useState<AiCreditLedgerItemResponse[]>([]);
  const [aiBillingView, setAiBillingView] = useState<"payment_history" | "usage">("payment_history");
  const [aiPendingManualPayments, setAiPendingManualPayments] = useState<AiPendingManualPaymentItem[]>([]);
  const [isVerifyingAiManualPayment, setIsVerifyingAiManualPayment] = useState(false);
  const [verifyingAiPaymentId, setVerifyingAiPaymentId] = useState<string | null>(null);
  const [aiVerifyReferenceInput, setAiVerifyReferenceInput] = useState("");
  const [aiVerifyError, setAiVerifyError] = useState<string | null>(null);
  const [aiVerifySuccess, setAiVerifySuccess] = useState<string | null>(null);
  const [aiCheckoutStatusItem, setAiCheckoutStatusItem] = useState<AiPaymentHistoryItemResponse | null>(null);
  const [aiPendingCheckoutReference, setAiPendingCheckoutReference] = useState("");
  const [isPollingAiCheckoutStatus, setIsPollingAiCheckoutStatus] = useState(false);
  const [aiBillingError, setAiBillingError] = useState<string | null>(null);
  const [aiCheckoutMessage, setAiCheckoutMessage] = useState<string | null>(null);
  const [aiTopUpUnavailable, setAiTopUpUnavailable] = useState(false);
  const [isAiManualFallbackExpanded, setIsAiManualFallbackExpanded] = useState(false);
  const [aiManualPaymentMethod, setAiManualPaymentMethod] = useState<"cash" | "bank_deposit">("bank_deposit");
  const [aiManualBankReference, setAiManualBankReference] = useState("");
  const [aiPanelViewedTracked, setAiPanelViewedTracked] = useState(false);

  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [isPwaInstalling, setIsPwaInstalling] = useState(false);

  const resolvedActivationKey = useMemo(
    () =>
      accessData?.activation_entitlement?.activation_entitlement_key?.trim() ||
      activationKeyInput.trim(),
    [accessData?.activation_entitlement?.activation_entitlement_key, activationKeyInput],
  );

  const displayedActivationKey = isKeyVisible
    ? resolvedActivationKey
    : maskActivationKey(resolvedActivationKey);
  const canViewLicensePortal = canAccessLicensePortal(authSession?.role);
  const installerDownloadUrl = (accessData?.installer_download_url || "").trim();
  const installerChecksum = (accessData?.installer_checksum_sha256 || "").trim();
  const installerLinkExpiresAt = accessData?.installer_download_expires_at;
  const installerLinkExpired = isPastDate(installerLinkExpiresAt);
  const installerDownloadAvailable = Boolean(installerDownloadUrl) && !installerLinkExpired;
  const selectedAiPack = useMemo(
    () => aiCreditPacks.find((pack) => pack.pack_code === selectedAiPackCode) || null,
    [aiCreditPacks, selectedAiPackCode],
  );
  const aiStatusReference = aiCheckoutStatusItem?.external_reference || aiPendingCheckoutReference || null;
  const aiSupportMailtoHref = useMemo(
    () => buildAiSupportMailto(aiStatusReference),
    [aiStatusReference],
  );
  const clearPendingAiCheckoutReference = useCallback(() => {
    setAiPendingCheckoutReference("");
    window.sessionStorage.removeItem(AccountAiPendingCheckoutReferenceStorageKey);
  }, []);
  const clearPendingAiCheckoutTracking = useCallback(() => {
    setAiCheckoutStatusItem(null);
    clearPendingAiCheckoutReference();
  }, [clearPendingAiCheckoutReference]);
  const resetAiManualFallbackState = useCallback(() => {
    setIsAiManualFallbackExpanded(false);
    setAiManualPaymentMethod("bank_deposit");
    setAiManualBankReference("");
  }, []);
  const persistPendingAiCheckoutReference = useCallback((reference: string) => {
    const normalizedReference = reference.trim();
    if (!normalizedReference) {
      clearPendingAiCheckoutTracking();
      resetAiManualFallbackState();
      return;
    }

    window.sessionStorage.setItem(
      AccountAiPendingCheckoutReferenceStorageKey,
      normalizedReference,
    );
    setAiPendingCheckoutReference(normalizedReference);
  }, [clearPendingAiCheckoutTracking, resetAiManualFallbackState]);

  useEffect(() => {
    if (!AccountAiTopUpEnabled) {
      return;
    }

    const storedReference = window.sessionStorage
      .getItem(AccountAiPendingCheckoutReferenceStorageKey)
      ?.trim();
    if (!storedReference) {
      return;
    }

    setAiPendingCheckoutReference(storedReference);
    setAiCheckoutMessage("Resuming your recent AI credit checkout status...");
    trackMarketingEvent("marketing_account_ai_checkout_returned", {
      locale,
      external_reference: storedReference,
    });
  }, [locale]);

  useEffect(() => {
    if (!AccountAiTopUpEnabled || !portalData || aiPanelViewedTracked || !canViewLicensePortal) {
      return;
    }

    trackMarketingEvent("marketing_account_ai_topup_panel_viewed", {
      locale,
      shop_code: portalData.shop_code,
      plan: portalData.plan,
    });
    setAiPanelViewedTracked(true);
  }, [aiPanelViewedTracked, canViewLicensePortal, locale, portalData]);

  useEffect(() => {
    if (!portalData) {
      setAiPanelViewedTracked(false);
    }
  }, [portalData]);

  const loadAccess = useCallback(
    async (activationEntitlementKey: string, source: "query" | "manual" | "portal") => {
      const normalizedKey = activationEntitlementKey.trim();
      if (!normalizedKey) {
        setAccessError("Activation entitlement key is required.");
        return;
      }

      setIsLoadingAccess(true);
      setAccessError(null);

      try {
        const response = await fetch(
          `/api/license/access-success?activation_entitlement_key=${encodeURIComponent(normalizedKey)}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload = await parseApiPayload(response);
        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        const data = requireObjectPayload<LicenseAccessSuccessResponse>(
          payload,
          "License access payload is empty.",
        );
        setAccessData(data);
        setIsKeyVisible(false);
        setCopied(false);
        trackMarketingEvent("marketing_account_access_loaded", {
          locale,
          source,
          shop_code: data.shop_code,
          subscription_status: data.subscription_status,
          plan: data.plan,
        });
      } catch (error) {
        setAccessData(null);
        setAccessError(error instanceof Error ? error.message : "Unable to load account access details.");
      } finally {
        setIsLoadingAccess(false);
      }
    },
    [locale],
  );

  const loadLicensePortal = useCallback(
    async (syncActivationKeyFromPortal: boolean) => {
      setIsLoadingPortal(true);
      setPortalError(null);
      try {
        const response = await fetch("/api/account/license-portal", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await parseApiPayload(response);
        if (response.status === 401) {
          setAuthSession(null);
          setPortalData(null);
          setAccessData(null);
          setPortalError("Your session expired. Please log in again.");
          return;
        }

        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        const data = requireObjectPayload<CustomerLicensePortalResponse>(
          payload,
          "License portal payload is empty.",
        );
        setPortalData(data);

        const activationEntitlementKey = data.latest_activation_entitlement?.activation_entitlement_key?.trim();
        if (syncActivationKeyFromPortal && activationEntitlementKey) {
          setActivationKeyInput(activationEntitlementKey);
          await loadAccess(activationEntitlementKey, "portal");
        }

        trackMarketingEvent("marketing_account_portal_loaded", {
          locale,
          shop_code: data.shop_code,
          subscription_status: data.subscription_status,
          plan: data.plan,
          active_seats: data.active_seats,
          seat_limit: data.seat_limit,
        });
      } catch (error) {
        setPortalData(null);
        setPortalError(error instanceof Error ? error.message : "Unable to load license portal.");
      } finally {
        setIsLoadingPortal(false);
      }
    },
    [loadAccess, locale],
  );

  const loadAiBillingData = useCallback(
    async (options?: { trackEvent?: boolean }): Promise<AiPaymentHistoryItemResponse[] | null> => {
      if (!AccountAiTopUpEnabled) {
        return null;
      }

      const shouldTrackEvent = options?.trackEvent ?? true;
      setIsLoadingAiBilling(true);
      setAiBillingError(null);
      try {
        const [walletResponse, packsResponse, paymentsResponse, ledgerResponse, pendingManualResponse] = await Promise.all([
          fetch("/api/account/ai/wallet", { method: "GET", cache: "no-store" }),
          fetch("/api/account/ai/credit-packs", { method: "GET", cache: "no-store" }),
          fetch("/api/account/ai/payments?take=10", { method: "GET", cache: "no-store" }),
          fetch("/api/account/ai/ledger?take=50", { method: "GET", cache: "no-store" }),
          fetch("/api/account/ai/payments/pending-manual?take=40", { method: "GET", cache: "no-store" }),
        ]);

        const [walletPayload, packsPayload, paymentsPayload, ledgerPayload, pendingManualPayload] = await Promise.all([
          parseApiPayload(walletResponse),
          parseApiPayload(packsResponse),
          parseApiPayload(paymentsResponse),
          parseApiPayload(ledgerResponse),
          parseApiPayload(pendingManualResponse),
        ]);

        if (
          walletResponse.status === 401 ||
          packsResponse.status === 401 ||
          paymentsResponse.status === 401 ||
          ledgerResponse.status === 401 ||
          pendingManualResponse?.status === 401
        ) {
          setAuthSession(null);
          setAiWallet(null);
          setAiCreditPacks([]);
          setSelectedAiPackCode("");
          setAiPaymentHistory([]);
          setAiCreditLedger([]);
          setAiPendingManualPayments([]);
          setAiCheckoutStatusItem(null);
          setAiTopUpUnavailable(false);
          setAiCheckoutMessage(null);
          setAiVerifyError(null);
          setAiVerifySuccess(null);
          resetAiManualFallbackState();
          setAiBillingError("Your session expired. Please log in again.");
          return null;
        }

        if (
          walletResponse.status === 403 ||
          packsResponse.status === 403 ||
          paymentsResponse.status === 403 ||
          ledgerResponse.status === 403 ||
          pendingManualResponse?.status === 403
        ) {
          setAiTopUpUnavailable(true);
          setAiWallet(null);
          setAiCreditPacks([]);
          setSelectedAiPackCode("");
          setAiPaymentHistory([]);
          setAiCreditLedger([]);
          setAiPendingManualPayments([]);
          clearPendingAiCheckoutTracking();
          setAiCheckoutMessage(null);
          setAiVerifyError(null);
          setAiVerifySuccess(null);
          resetAiManualFallbackState();
          return null;
        }

        if (!walletResponse.ok) {
          throw new Error(parseErrorMessage(walletPayload));
        }

        if (!packsResponse.ok) {
          throw new Error(parseErrorMessage(packsPayload));
        }

        if (!paymentsResponse.ok) {
          throw new Error(parseErrorMessage(paymentsPayload));
        }

        if (!ledgerResponse.ok) {
          throw new Error(parseErrorMessage(ledgerPayload));
        }

        const wallet = requireObjectPayload<AiWalletResponse>(walletPayload, "Wallet payload is empty.");
        const packs = requireObjectPayload<AiCreditPackListResponse>(
          packsPayload,
          "AI credit packs payload is empty.",
        );
        const payments = requireObjectPayload<AiPaymentHistoryResponse>(
          paymentsPayload,
          "AI payment history payload is empty.",
        );
        const ledger = requireObjectPayload<AiCreditLedgerResponse>(
          ledgerPayload,
          "AI credit ledger payload is empty.",
        );

        const nextPacks = Array.isArray(packs.items) ? packs.items : [];
        const nextPayments = Array.isArray(payments.items) ? payments.items : [];
        const nextLedger = Array.isArray(ledger.items) ? ledger.items : [];

        setAiTopUpUnavailable(false);
        setAiWallet(wallet);
        setAiCreditPacks(nextPacks);
        setAiPaymentHistory(nextPayments);
        setAiCreditLedger(nextLedger);
        if (pendingManualResponse?.ok && pendingManualPayload) {
          const pendingManual = requireObjectPayload<AiPendingManualPaymentsResponse>(
            pendingManualPayload,
            "AI pending manual payments payload is empty.",
          );
          setAiPendingManualPayments(Array.isArray(pendingManual.items) ? pendingManual.items : []);
        } else {
          setAiPendingManualPayments([]);
        }
        setSelectedAiPackCode((current) => {
          if (current && nextPacks.some((pack) => pack.pack_code === current)) {
            return current;
          }

          return nextPacks[0]?.pack_code || "";
        });

        if (aiPendingCheckoutReference) {
          const matchedCheckout = nextPayments.find(
            (item) => item.external_reference === aiPendingCheckoutReference,
          );
          setAiCheckoutStatusItem(matchedCheckout || null);
        }

        if (shouldTrackEvent) {
          trackMarketingEvent("marketing_account_ai_billing_loaded", {
            locale,
            credits_available: wallet.available_credits,
            pack_count: nextPacks.length,
          });
        }

        return nextPayments;
      } catch (error) {
        setAiWallet(null);
        setAiCreditPacks([]);
        setSelectedAiPackCode("");
        setAiPaymentHistory([]);
        setAiCreditLedger([]);
        setAiPendingManualPayments([]);
        setAiCheckoutStatusItem(null);
        setAiBillingError(error instanceof Error ? error.message : "Unable to load AI credit billing data.");
        setAiCheckoutMessage(null);
        setAiVerifyError(null);
        setAiVerifySuccess(null);
        resetAiManualFallbackState();
        return null;
      } finally {
        setIsLoadingAiBilling(false);
      }
    },
    [aiPendingCheckoutReference, clearPendingAiCheckoutTracking, locale, resetAiManualFallbackState],
  );

  const handleVerifyAiManualPayment = useCallback(
    async (paymentId: string): Promise<boolean> => {
      const normalizedPaymentId = paymentId.trim();
      if (!normalizedPaymentId) {
        setAiVerifyError("Payment ID is required.");
        return false;
      }

      setIsVerifyingAiManualPayment(true);
      setVerifyingAiPaymentId(normalizedPaymentId);
      setAiVerifyError(null);
      setAiVerifySuccess(null);
      try {
        const response = await fetch("/api/account/ai/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_id: normalizedPaymentId }),
        });
        const payload = await parseApiPayload(response);
        if (!response.ok) {
          setAiVerifyError(parseErrorMessage(payload) || "Verification failed.");
          return false;
        }

        const result = payload as { payment_status?: string };
        const status = normalizePaymentStatus(result.payment_status || "updated");
        setAiVerifySuccess(
          status === "succeeded"
            ? "Payment verified and credits were added."
            : `Payment status updated: ${status.replaceAll("_", " ")}.`,
        );
        await loadAiBillingData({ trackEvent: false });
        return true;
      } catch (error) {
        setAiVerifyError(error instanceof Error ? error.message : "Unexpected error.");
        return false;
      } finally {
        setIsVerifyingAiManualPayment(false);
        setVerifyingAiPaymentId(null);
      }
    },
    [loadAiBillingData],
  );

  const handleVerifyAiManualPaymentByReference = useCallback(async () => {
    const normalizedReference = aiVerifyReferenceInput.trim().toLowerCase();
    if (!normalizedReference) {
      setAiVerifyError("Enter a submitted or external reference.");
      return;
    }

    setAiVerifyError(null);
    setAiVerifySuccess(null);
    const matches = aiPendingManualPayments.filter((item) => {
      const externalReference = (item.external_reference || "").trim().toLowerCase();
      const submittedReference = (item.submitted_reference || "").trim().toLowerCase();
      return externalReference === normalizedReference || submittedReference === normalizedReference;
    });

    if (matches.length === 0) {
      setAiVerifyError("No pending payment matched this reference.");
      return;
    }

    if (matches.length > 1) {
      setAiVerifyError("Multiple pending payments match this reference. Verify from the exact row.");
      return;
    }

    const verified = await handleVerifyAiManualPayment(matches[0].payment_id);
    if (verified) {
      setAiVerifyReferenceInput("");
    }
  }, [aiPendingManualPayments, aiVerifyReferenceInput, handleVerifyAiManualPayment]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const activationEntitlementKey = (params.get("activation_entitlement_key") || "").trim();
    if (activationEntitlementKey) {
      setActivationKeyInput(activationEntitlementKey);
      void loadAccess(activationEntitlementKey, "query");
    }

    if (activationEntitlementKey) {
      params.delete("activation_entitlement_key");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    const deviceCode = resolveStoredAccountDeviceCode();
    setAccountDeviceCode(deviceCode);

    trackMarketingEvent("marketing_account_page_viewed", { locale });

    let active = true;
    const hydrateSession = async () => {
      setIsHydratingSession(true);
      try {
        const response = await fetch("/api/account/me", {
          method: "GET",
          cache: "no-store",
        });
        const payload = await parseApiPayload(response);
        if (!active) {
          return;
        }

        if (response.status === 401) {
          setAuthSession(null);
          setPortalData(null);
          setAiWallet(null);
          setAiCreditPacks([]);
          setSelectedAiPackCode("");
          setAiPaymentHistory([]);
          setAiPendingManualPayments([]);
          setAiTopUpUnavailable(false);
          setAiCheckoutMessage(null);
          clearPendingAiCheckoutTracking();
          resetAiManualFallbackState();
          return;
        }

        if (!response.ok) {
          throw new Error(parseErrorMessage(payload));
        }

        const session = requireObjectPayload<AuthSessionResponse>(
          payload,
          "Session payload is empty.",
        );
        setAuthSession(session);
        setAuthUsername(session.username);
        if (session.device_code?.trim()) {
          setAccountDeviceCode(session.device_code.trim());
        }

        if (!canAccessLicensePortal(session.role)) {
          setPortalData(null);
          setAccessData(null);
          setAiWallet(null);
          setAiCreditPacks([]);
          setSelectedAiPackCode("");
          setAiPaymentHistory([]);
          setAiPendingManualPayments([]);
          setAiTopUpUnavailable(false);
          setAiCheckoutMessage(null);
          clearPendingAiCheckoutTracking();
          resetAiManualFallbackState();
          setPortalError(LicensePortalAccessDeniedMessage);
          trackMarketingEvent("marketing_account_portal_access_denied", {
            locale,
            role: session.role,
            source: "session_hydration",
          });
          return;
        }

        setPortalError(null);
        await loadLicensePortal(true);
        await loadAiBillingData();
      } catch (error) {
        if (!active) {
          return;
        }
        setAuthSession(null);
        setPortalData(null);
        setAiWallet(null);
        setAiCreditPacks([]);
        setSelectedAiPackCode("");
        setAiPaymentHistory([]);
        setAiPendingManualPayments([]);
        setAiTopUpUnavailable(false);
        setAiCheckoutMessage(null);
        clearPendingAiCheckoutTracking();
        resetAiManualFallbackState();
        setAuthError(error instanceof Error ? error.message : "Unable to restore session.");
      } finally {
        if (active) {
          setIsHydratingSession(false);
        }
      }
    };

    void hydrateSession();
    return () => {
      active = false;
    };
  }, [
    clearPendingAiCheckoutTracking,
    loadAccess,
    loadAiBillingData,
    loadLicensePortal,
    locale,
    resetAiManualFallbackState,
  ]);

  useEffect(() => {
    if (!AccountAiTopUpEnabled || !aiPendingCheckoutReference || !authSession || !canViewLicensePortal || aiTopUpUnavailable) {
      return;
    }

    let cancelled = false;
    const reconcileCheckoutStatus = async () => {
      setIsPollingAiCheckoutStatus(true);
      try {
        for (let attempt = 0; attempt < AiCheckoutPollingMaxAttempts; attempt += 1) {
          if (cancelled) {
            return;
          }

          const payments = await loadAiBillingData({ trackEvent: false });
          if (cancelled) {
            return;
          }

          const matchedCheckout =
            payments?.find((item) => item.external_reference === aiPendingCheckoutReference) || null;
          if (matchedCheckout) {
            setAiCheckoutStatusItem(matchedCheckout);

            if (!isPaymentStatusProcessing(matchedCheckout.payment_status)) {
              if (normalizePaymentStatus(matchedCheckout.payment_status) === "succeeded") {
                setAiCheckoutMessage("AI credit top-up confirmed. Wallet balance has been updated.");
              } else {
                setAiCheckoutMessage(
                  `Latest payment status: ${toSentence(matchedCheckout.payment_status)}.`,
                );
              }
              trackMarketingEvent("marketing_account_ai_checkout_result", {
                locale,
                external_reference: matchedCheckout.external_reference,
                payment_status: matchedCheckout.payment_status,
                payment_method: matchedCheckout.payment_method,
              });
              clearPendingAiCheckoutReference();
              return;
            }
          }

          if (attempt < AiCheckoutPollingMaxAttempts - 1) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, AiCheckoutPollingIntervalMs);
            });
          }
        }

        setAiCheckoutMessage(
          "Payment is still processing. Use Refresh AI Billing in a few moments to check again.",
        );
        trackMarketingEvent("marketing_account_ai_checkout_result", {
          locale,
          external_reference: aiPendingCheckoutReference,
          payment_status: "processing_timeout",
        });
      } finally {
        if (!cancelled) {
          setIsPollingAiCheckoutStatus(false);
        }
      }
    };

    void reconcileCheckoutStatus();
    return () => {
      cancelled = true;
    };
  }, [
    aiPendingCheckoutReference,
    aiTopUpUnavailable,
    authSession,
    canViewLicensePortal,
    clearPendingAiCheckoutReference,
    clearPendingAiCheckoutTracking,
    loadAiBillingData,
    locale,
  ]);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setIsPwaInstalled(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPromptEvent(null);
      trackMarketingEvent("marketing_pwa_installed", { locale, source: "account_page" });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [locale]);

  const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadAccess(activationKeyInput, "manual");
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = authUsername.trim();
    const password = authPassword;
    const deviceCode = accountDeviceCode.trim() || resolveStoredAccountDeviceCode();
    if (!username || !password || !deviceCode) {
      setAuthError("Username, password, and device code are required.");
      return;
    }

    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          mfa_code: authMfaCode.trim() || undefined,
          device_code: deviceCode,
          device_name: "Marketing Account Web",
        }),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const session = requireObjectPayload<AuthSessionResponse>(
        payload,
        "Login response is empty.",
      );
      setAuthSession(session);
      setAuthUsername(session.username);
      setAuthPassword("");
      setAuthMfaCode("");
      setAccountDeviceCode(session.device_code || deviceCode);
      setPortalError(null);

      if (!canAccessLicensePortal(session.role)) {
        setPortalData(null);
        setAccessData(null);
        setAiWallet(null);
        setAiCreditPacks([]);
        setSelectedAiPackCode("");
        setAiPaymentHistory([]);
        setAiPendingManualPayments([]);
        setAiTopUpUnavailable(false);
        setAiCheckoutMessage(null);
        clearPendingAiCheckoutTracking();
        resetAiManualFallbackState();
        setPortalError(LicensePortalAccessDeniedMessage);
        trackMarketingEvent("marketing_account_portal_access_denied", {
          locale,
          role: session.role,
          source: "manual_login",
        });
        return;
      }

      await loadLicensePortal(true);
      await loadAiBillingData();

      trackMarketingEvent("marketing_account_logged_in", {
        locale,
        role: session.role,
      });
    } catch (error) {
      setAuthSession(null);
      setPortalData(null);
      setAiWallet(null);
      setAiCreditPacks([]);
      setSelectedAiPackCode("");
      setAiPaymentHistory([]);
      setAiPendingManualPayments([]);
      setAiTopUpUnavailable(false);
      setAiCheckoutMessage(null);
      clearPendingAiCheckoutTracking();
      resetAiManualFallbackState();
      setAuthError(error instanceof Error ? error.message : "Unable to log in.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setAuthError(null);
    try {
      await fetch("/api/account/logout", {
        method: "POST",
      });
      setAuthSession(null);
      setPortalData(null);
      setPortalError(null);
      setAccessData(null);
      setIsKeyVisible(false);
      setCopied(false);
      setAiWallet(null);
      setAiCreditPacks([]);
      setSelectedAiPackCode("");
      setAiPaymentHistory([]);
      setAiPendingManualPayments([]);
      setAiBillingError(null);
      setAiCheckoutMessage(null);
      setAiTopUpUnavailable(false);
      clearPendingAiCheckoutTracking();
      resetAiManualFallbackState();
      trackMarketingEvent("marketing_account_logged_out", { locale });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleCopyActivationKey = async () => {
    const value = resolvedActivationKey.trim();
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      trackMarketingEvent("marketing_account_activation_key_copied", { locale });
      void trackLicenseAction("activation_key_copy");
    } catch {
      setAccessError("Could not copy key. Please copy it manually.");
    }
  };

  const handleCopyChecksum = async () => {
    const checksum = installerChecksum.trim();
    if (!checksum) {
      return;
    }

    try {
      await navigator.clipboard.writeText(checksum);
      setChecksumCopied(true);
      setTimeout(() => setChecksumCopied(false), 1200);
      trackMarketingEvent("marketing_installer_checksum_copied", { locale });
      void trackLicenseAction("installer_checksum_copy");
    } catch {
      setAccessError("Could not copy checksum. Please copy it manually.");
    }
  };

  const handleInstallPwa = async () => {
    if (!installPromptEvent) {
      return;
    }

    setIsPwaInstalling(true);
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      trackMarketingEvent("marketing_pwa_install_prompt_result", {
        locale,
        source: "account_page",
        outcome: choice.outcome,
        platform: choice.platform,
      });
      if (choice.outcome === "accepted") {
        setInstallPromptEvent(null);
      }
    } finally {
      setIsPwaInstalling(false);
    }
  };

  const handleDeactivateDevice = async (deviceCode: string) => {
    const normalizedDeviceCode = deviceCode.trim();
    if (!normalizedDeviceCode) {
      return;
    }

    setDeactivatingDeviceCode(normalizedDeviceCode);
    setPortalError(null);
    try {
      const response = await fetch(
        `/api/account/license-portal/devices/${encodeURIComponent(normalizedDeviceCode)}/deactivate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            reason: "customer_self_service",
          }),
        },
      );

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      trackMarketingEvent("marketing_account_device_deactivated", {
        locale,
        device_code: normalizedDeviceCode,
      });
      await loadLicensePortal(true);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Unable to deactivate device.");
    } finally {
      setDeactivatingDeviceCode(null);
    }
  };

  const handleAiCheckout = async (paymentMethod: AiCheckoutMethod) => {
    if (!AccountAiTopUpEnabled || aiTopUpUnavailable) {
      return;
    }

    const packCode = selectedAiPackCode.trim();
    if (!packCode) {
      setAiBillingError("Select a credit pack first.");
      return;
    }

    const normalizedMethod = paymentMethod;
    const bankReference = aiManualBankReference.trim();

    if (normalizedMethod === "cash" && !bankReference) {
      setAiBillingError("Reference is required for cash manual payments.");
      return;
    }

    if (normalizedMethod === "bank_deposit" && !bankReference) {
      setAiBillingError("Bank reference is required for bank transfer.");
      return;
    }

    setIsCreatingAiCheckout(true);
    setAiBillingError(null);
    setAiCheckoutMessage(null);
    trackMarketingEvent("marketing_account_ai_checkout_started", {
      locale,
      pack_code: packCode,
      payment_method: normalizedMethod,
    });
    try {
      const requestPayload: Record<string, string> = {
        pack_code: packCode,
        payment_method: normalizedMethod,
      };
      if (normalizedMethod !== "card") {
        requestPayload.bank_reference = bankReference;
      }

      const response = await fetch("/api/account/ai/payments/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(requestPayload),
      });

      const payload = await parseApiPayload(response);
      if (!response.ok) {
        throw new Error(parseErrorMessage(payload));
      }

      const checkout = requireObjectPayload<AiCheckoutSessionResponse>(
        payload,
        "AI checkout response is empty.",
      );

      trackMarketingEvent("marketing_account_ai_checkout_created", {
        locale,
        pack_code: checkout.pack_code,
        amount: checkout.amount,
        currency: checkout.currency,
        payment_status: checkout.payment_status,
        payment_method: checkout.payment_method,
      });

      const checkoutReference = checkout.external_reference?.trim();
      if (checkoutReference) {
        persistPendingAiCheckoutReference(checkoutReference);
      }
      setAiCheckoutStatusItem({
        payment_id: checkout.payment_id,
        payment_status: checkout.payment_status,
        payment_method: checkout.payment_method,
        provider: checkout.provider,
        credits: checkout.credits,
        amount: checkout.amount,
        currency: checkout.currency,
        external_reference: checkoutReference || checkout.payment_id,
        created_at: checkout.created_at,
        completed_at: null,
      });

      if (checkout.checkout_url?.trim()) {
        setAiCheckoutMessage("Redirecting to secure checkout...");
        window.location.href = checkout.checkout_url.trim();
        return;
      }

      const returnedStatus = normalizePaymentStatus(checkout.payment_status);
      if (returnedStatus === "pending_verification" || normalizedMethod !== "card") {
        setAiCheckoutMessage(
          "Manual payment request submitted. Your credits will be added after billing verification.",
        );
      } else {
        setAiCheckoutMessage(
          "Checkout session was created without a redirect URL. Please complete payment using the provided reference or contact support.",
        );
      }

      if (normalizedMethod !== "card") {
        setIsAiManualFallbackExpanded(false);
        setAiManualBankReference("");
      }
      await loadAiBillingData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start AI credit checkout.";
      setAiBillingError(message);
      trackMarketingEvent("marketing_account_ai_checkout_failed", {
        locale,
        payment_method: normalizedMethod,
        error: message.slice(0, 160),
      });
    } finally {
      setIsCreatingAiCheckout(false);
    }
  };

  const trackLicenseAction = useCallback(
    async (channel: string) => {
      const normalizedKey = resolvedActivationKey.trim();
      if (!normalizedKey) {
        return;
      }

      try {
        await fetch("/api/license/download-track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            activation_entitlement_key: normalizedKey,
            source: "marketing_account_page",
            channel,
          }),
        });
      } catch {
        // Best-effort audit tracking.
      }
    },
    [resolvedActivationKey],
  );

  return (
    <main className="app-shell px-4 py-10 md:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Home
        </Link>

        <section className="portal-surface space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with your owner/manager account to view license seats and manage devices. You can also use an activation key for direct access.
            </p>
          </div>

          {isHydratingSession && (
            <p className="text-sm text-muted-foreground">Checking existing session...</p>
          )}

          {authSession ? (
            <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
              <p className="text-sm">
                Signed in as <span className="font-semibold">{authSession.full_name}</span> ({authSession.username})
              </p>
              <p className="text-xs text-muted-foreground">
                Role: {authSession.role} · Device: {authSession.device_code} · Session expires:{" "}
                {formatDate(authSession.expires_at)}
              </p>
              {!canViewLicensePortal && (
                <p className="text-xs text-muted-foreground">
                  License management is restricted to owner and manager roles.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void (async () => {
                      await loadLicensePortal(true);
                      await loadAiBillingData();
                    })();
                  }}
                  disabled={(isLoadingPortal || isLoadingAiBilling) || !canViewLicensePortal}
                >
                  {isLoadingPortal ? "Refreshing..." : "Refresh Account"}
                </Button>
                <Button type="button" variant="outline" onClick={handleLogout} disabled={isLoggingOut}>
                  <LogOut size={16} />
                  {isLoggingOut ? "Signing out..." : "Sign Out"}
                </Button>
              </div>
            </div>
          ) : (
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleLogin}>
              <label className="space-y-1">
                <span className="portal-kicker">Username</span>
                <input
                  className="field-shell"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  placeholder="owner"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="portal-kicker">Password</span>
                <input
                  type="password"
                  className="field-shell"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="portal-kicker">MFA Code (optional)</span>
                <input
                  className="field-shell"
                  value={authMfaCode}
                  onChange={(event) => setAuthMfaCode(event.target.value)}
                  placeholder="123456"
                />
              </label>
              <label className="space-y-1">
                <span className="portal-kicker">Device Code</span>
                <input
                  className="field-shell font-mono"
                  value={accountDeviceCode}
                  onChange={(event) => setAccountDeviceCode(event.target.value.toUpperCase())}
                  required
                />
              </label>
              {authError && <p className="text-sm text-destructive md:col-span-2">{authError}</p>}
              <div className="md:col-span-2">
                <Button type="submit" variant="hero" disabled={isLoggingIn || isHydratingSession}>
                  {isLoggingIn ? "Signing in..." : "Sign In"}
                </Button>
              </div>
            </form>
          )}
        </section>

        {portalError && (
          <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {portalError}
          </section>
        )}

        {portalData && (
          <>
            <section className="portal-surface space-y-4">
              <h2 className="text-xl font-semibold">Licensed Account</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4">
                  <p className="portal-kicker">Shop</p>
                  <p className="mt-1 text-sm font-semibold">{portalData.shop_name}</p>
                  <p className="text-xs text-muted-foreground">{portalData.shop_code}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4">
                  <p className="portal-kicker">Seats</p>
                  <p className="mt-1 text-sm">
                    Active: <span className="font-semibold">{portalData.active_seats}</span> /{" "}
                    <span className="font-semibold">{portalData.seat_limit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Deactivations left today: {portalData.self_service_deactivations_remaining_today}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Plan: <span className="font-medium">{portalData.plan}</span> · Subscription:{" "}
                <span className="font-medium capitalize">{toSentence(portalData.subscription_status)}</span>
              </p>
            </section>

            {AccountAiTopUpEnabled && (
              <section className="portal-surface space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">AI Credits</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Buy AI credits for ongoing insights after setup. Card checkout is recommended for instant top-up.
                  </p>
                </div>

                {isLoadingAiBilling && !aiWallet && (
                  <p className="text-sm text-muted-foreground">Loading AI credit billing data...</p>
                )}

                {aiTopUpUnavailable && (
                  <p className="text-sm text-muted-foreground">
                    AI credit purchase is unavailable for this account or role.
                  </p>
                )}

                {!aiTopUpUnavailable && (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-surface-muted p-4">
                        <p className="portal-kicker">Available Credits</p>
                        <p className="mt-1 text-lg font-semibold">
                          {formatCredits(aiWallet?.available_credits)} credits
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last updated: {formatDate(aiWallet?.updated_at)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                        <p className="portal-kicker">Top-Up Pack</p>
                        <select
                          className="field-shell"
                          value={selectedAiPackCode}
                          onChange={(event) => {
                            const nextPackCode = event.target.value;
                            setSelectedAiPackCode(nextPackCode);
                            if (nextPackCode) {
                              trackMarketingEvent("marketing_account_ai_pack_selected", {
                                locale,
                                pack_code: nextPackCode,
                              });
                            }
                          }}
                          disabled={aiCreditPacks.length === 0 || isCreatingAiCheckout}
                        >
                          {aiCreditPacks.length === 0 ? (
                            <option value="">No packs available</option>
                          ) : (
                            aiCreditPacks.map((pack) => (
                              <option key={pack.pack_code} value={pack.pack_code}>
                                {pack.pack_code} · {formatCredits(pack.credits)} credits · {formatAmount(pack.price, pack.currency)}
                              </option>
                            ))
                          )}
                        </select>
                        {selectedAiPack && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              You will add <span className="font-semibold">{formatCredits(selectedAiPack.credits)}</span> credits for{" "}
                              <span className="font-semibold">{formatAmount(selectedAiPack.price, selectedAiPack.currency)}</span>.
                            </p>
                            {typeof aiWallet?.available_credits === "number" && (
                              <p className="text-xs text-muted-foreground">
                                Estimated balance after top-up:{" "}
                                <span className="font-semibold">
                                  {formatCredits(aiWallet.available_credits + selectedAiPack.credits)} credits
                                </span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="hero"
                        disabled={isCreatingAiCheckout || !selectedAiPackCode.trim()}
                        onClick={() => {
                          void handleAiCheckout("card");
                        }}
                      >
                        <CreditCard size={16} />
                        {isCreatingAiCheckout ? "Opening Checkout..." : "Pay with Card"}
                      </Button>
                      {AccountAiManualFallbackEnabled && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isCreatingAiCheckout || !selectedAiPackCode.trim()}
                          onClick={() => {
                            setIsAiManualFallbackExpanded((value) => !value);
                            setAiManualPaymentMethod("bank_deposit");
                            trackMarketingEvent("marketing_account_ai_manual_fallback_toggled", {
                              locale,
                            });
                          }}
                        >
                          Need Bank Transfer?
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isLoadingAiBilling || isCreatingAiCheckout}
                        onClick={() => {
                          void loadAiBillingData();
                        }}
                      >
                        {isLoadingAiBilling ? "Refreshing AI Billing..." : "Refresh AI Billing"}
                      </Button>
                    </div>

                    {AccountAiManualFallbackEnabled && isAiManualFallbackExpanded && (
                      <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                        <div className="space-y-1">
                          <p className="portal-kicker">
                            Manual Payment Fallback
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Use this only when card checkout is unavailable. Credits are added after billing verification.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="ai_manual_payment_method"
                              value="bank_deposit"
                              checked={aiManualPaymentMethod === "bank_deposit"}
                              onChange={() => setAiManualPaymentMethod("bank_deposit")}
                            />
                            Bank Deposit
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="ai_manual_payment_method"
                              value="cash"
                              checked={aiManualPaymentMethod === "cash"}
                              onChange={() => setAiManualPaymentMethod("cash")}
                            />
                            Cash
                          </label>
                        </div>

                        <div className="grid gap-3">
                          <label className="space-y-1">
                            <span className="portal-kicker">
                              Reference
                            </span>
                            <input
                              className="field-shell"
                              value={aiManualBankReference}
                              onChange={(event) => setAiManualBankReference(event.target.value)}
                              placeholder={aiManualPaymentMethod === "cash" ? "CASH-REF-001" : "BANK-REF-001"}
                            />
                          </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isCreatingAiCheckout || !selectedAiPackCode.trim()}
                            onClick={() => {
                              void handleAiCheckout(aiManualPaymentMethod);
                            }}
                          >
                            {isCreatingAiCheckout ? "Submitting..." : "Submit Manual Payment"}
                          </Button>
                          <a
                            className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                            href={aiSupportMailtoHref}
                            onClick={() => {
                              trackMarketingEvent("marketing_account_ai_support_contact_clicked", {
                                locale,
                                source: "manual_fallback",
                                external_reference: aiStatusReference || undefined,
                              });
                            }}
                          >
                            Contact Support
                          </a>
                        </div>
                      </div>
                    )}

                    {aiBillingError && (
                      <p className="text-sm text-destructive">{aiBillingError}</p>
                    )}
                    {aiCheckoutMessage && (
                      <p className="text-sm text-muted-foreground">{aiCheckoutMessage}</p>
                    )}

                    {(aiCheckoutStatusItem || aiPendingCheckoutReference || isPollingAiCheckoutStatus) && (
                      <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-1">
                        <p className="portal-kicker">
                          Latest Checkout Status
                        </p>
                        <p className="text-sm">
                          Status:{" "}
                          <span className="font-semibold">
                            {toSentence(
                              aiCheckoutStatusItem?.payment_status ||
                                (isPollingAiCheckoutStatus ? "processing" : "pending"),
                            )}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground font-mono break-all">
                          Reference: {aiCheckoutStatusItem?.external_reference || aiPendingCheckoutReference || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {resolvePaymentStatusGuidance(aiCheckoutStatusItem?.payment_status)}
                        </p>
                        {aiCheckoutStatusItem && (
                          <p className="text-xs text-muted-foreground">
                            {formatCredits(aiCheckoutStatusItem.credits)} credits ·{" "}
                            {formatAmount(aiCheckoutStatusItem.amount, aiCheckoutStatusItem.currency)} ·{" "}
                            {toSentence(aiCheckoutStatusItem.payment_method)} · Created {formatDate(aiCheckoutStatusItem.created_at)}
                          </p>
                        )}
                        {isPollingAiCheckoutStatus && (
                          <p className="text-xs text-muted-foreground">
                            Checking payment confirmation...
                          </p>
                        )}
                        {!isPollingAiCheckoutStatus &&
                          normalizePaymentStatus(aiCheckoutStatusItem?.payment_status) !== "succeeded" && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isCreatingAiCheckout || !selectedAiPackCode.trim()}
                                onClick={() => {
                                  void handleAiCheckout("card");
                                }}
                              >
                                Retry Card Payment
                              </Button>
                              {AccountAiManualFallbackEnabled && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isCreatingAiCheckout || !selectedAiPackCode.trim()}
                                  onClick={() => {
                                    setIsAiManualFallbackExpanded(true);
                                    setAiManualPaymentMethod("bank_deposit");
                                    trackMarketingEvent("marketing_account_ai_manual_fallback_toggled", {
                                      locale,
                                      source: "status_panel",
                                    });
                                  }}
                                >
                                  Switch to Bank Transfer
                                </Button>
                              )}
                              <a
                                className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                                href={aiSupportMailtoHref}
                                onClick={() => {
                                  trackMarketingEvent("marketing_account_ai_support_contact_clicked", {
                                    locale,
                                    source: "status_panel",
                                    external_reference: aiStatusReference || undefined,
                                  });
                                }}
                              >
                                Contact Support
                              </a>
                            </div>
                          )}
                      </div>
                    )}

                    <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="portal-kicker">Billing Activity</p>
                        <div className="inline-flex rounded-md border border-border/70 bg-background p-1">
                          <button
                            type="button"
                            className={`rounded px-2 py-1 text-xs ${aiBillingView === "payment_history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                            onClick={() => setAiBillingView("payment_history")}
                          >
                            Payment History
                          </button>
                          <button
                            type="button"
                            className={`rounded px-2 py-1 text-xs ${aiBillingView === "usage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                            onClick={() => setAiBillingView("usage")}
                          >
                            Usage
                          </button>
                        </div>
                      </div>

                      {aiBillingView === "payment_history" && (
                        <>
                          {aiPaymentHistory.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No AI credit payments found yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {aiPaymentHistory.slice(0, 8).map((item) => (
                                <div
                                  key={item.payment_id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium">
                                      {formatCredits(item.credits)} credits · {formatAmount(item.amount, item.currency)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {toSentence(item.payment_status)} · {toSentence(item.payment_method)} · {formatDate(item.created_at)}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {item.external_reference || item.payment_id}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {aiBillingView === "usage" && (
                        <>
                          {aiCreditLedger.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No AI credit usage entries yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {aiCreditLedger.slice(0, 12).map((item, index) => (
                                <div
                                  key={`${item.created_at_utc}-${item.entry_type}-${item.reference || index}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium">
                                      {toSentence(item.entry_type)} ·{" "}
                                      <span className={item.delta_credits >= 0 ? "text-emerald-700" : "text-amber-700"}>
                                        {item.delta_credits >= 0 ? "+" : ""}
                                        {formatCredits(item.delta_credits)} credits
                                      </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Balance after: {formatCredits(item.balance_after_credits)} · {formatDate(item.created_at_utc)}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {(item.reference || item.description || "-").toString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {canViewLicensePortal && (
                      <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                        <p className="portal-kicker">Pending Verifications</p>
                        <p className="text-sm text-muted-foreground">
                          Manual AI credit purchases (`cash` / `bank_deposit`) awaiting confirmation.
                        </p>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={aiVerifyReferenceInput}
                            onChange={(event) => {
                              setAiVerifyReferenceInput(event.target.value);
                              setAiVerifyError(null);
                              setAiVerifySuccess(null);
                            }}
                            placeholder="Submitted ref or aicpay_... external ref"
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm sm:flex-1"
                          />
                          <Button
                            type="button"
                            disabled={isVerifyingAiManualPayment || !aiVerifyReferenceInput.trim()}
                            onClick={() => {
                              void handleVerifyAiManualPaymentByReference();
                            }}
                          >
                            {isVerifyingAiManualPayment ? "Verifying..." : "Verify by Reference"}
                          </Button>
                        </div>

                        {aiVerifyError && (
                          <p className="text-sm text-destructive">{aiVerifyError}</p>
                        )}
                        {aiVerifySuccess && (
                          <p className="text-sm text-emerald-700">{aiVerifySuccess}</p>
                        )}

                        {aiPendingManualPayments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No pending manual payment requests.</p>
                        ) : (
                          <div className="space-y-2">
                            {aiPendingManualPayments.map((item) => (
                              <div
                                key={item.payment_id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {formatCredits(item.credits)} credits · {formatAmount(item.amount, item.currency)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {toSentence(item.payment_method)} · {toSentence(item.payment_status)} · {formatDate(item.created_at)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    User: {item.target_full_name || item.target_username}
                                    {item.target_full_name ? ` (${item.target_username})` : ""}
                                    {item.shop_name ? ` · Shop: ${item.shop_name}` : ""}
                                  </p>
                                  <p className="text-xs font-mono text-muted-foreground">
                                    Ref: {item.submitted_reference || "-"} · {item.external_reference}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isVerifyingAiManualPayment}
                                  onClick={() => {
                                    void handleVerifyAiManualPayment(item.payment_id);
                                  }}
                                >
                                  {isVerifyingAiManualPayment && verifyingAiPaymentId === item.payment_id ? "Verifying..." : "Verify"}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            <section className="portal-surface space-y-4">
              <h2 className="text-xl font-semibold">Devices</h2>
              <div className="space-y-3">
                {portalData.devices.length === 0 && (
                  <p className="text-sm text-muted-foreground">No provisioned devices found for this shop yet.</p>
                )}
                {portalData.devices.map((device) => {
                  const canDeactivate =
                    portalData.can_deactivate_more_devices_today &&
                    device.device_status.toLowerCase() === "active" &&
                    !device.is_current_device;
                  const isDeactivating = deactivatingDeviceCode === device.device_code;
                  return (
                    <div key={device.provisioned_device_id} className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{device.device_name || device.device_code}</p>
                        <p className="text-xs text-muted-foreground">{device.device_code}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Status: {toSentence(device.device_status)} · License: {toSentence(device.license_state)}
                        {device.is_current_device ? " · Current session device" : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last heartbeat: {formatDate(device.last_heartbeat_at)} · Valid until: {formatDate(device.valid_until)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canDeactivate || isDeactivating}
                        onClick={() => {
                          void handleDeactivateDevice(device.device_code);
                        }}
                      >
                        {isDeactivating ? "Deactivating..." : "Deactivate Device"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <section className="portal-surface space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Activation Key Access</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use this if you already have an activation entitlement key from payment success/email.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleLookup}>
            <label className="space-y-1 block">
              <span className="portal-kicker">
                Activation Entitlement Key
              </span>
              <input
                className="field-shell font-mono"
                value={activationKeyInput}
                onChange={(event) => setActivationKeyInput(event.target.value)}
                placeholder="SPK-..."
                required
              />
            </label>
            {accessError && <p className="text-sm text-destructive">{accessError}</p>}
            <Button type="submit" variant="hero" disabled={isLoadingAccess}>
              {isLoadingAccess ? "Loading..." : "Load By Key"}
            </Button>
          </form>
        </section>

        {accessData && (
          <>
            <section className="portal-surface space-y-4">
              <h2 className="text-xl font-semibold">Activation Key</h2>
              <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                <p className="portal-kicker">License Key</p>
                <p className="font-mono text-sm break-all">{displayedActivationKey || "-"}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setIsKeyVisible((value) => {
                        const nextValue = !value;
                        if (!value && nextValue) {
                          void trackLicenseAction("activation_key_reveal");
                        }
                        return nextValue;
                      })
                    }
                  >
                    {isKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    {isKeyVisible ? "Hide" : "Reveal"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCopyActivationKey}>
                    <Copy size={16} />
                    {copied ? "Copied" : "Copy Key"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Activations: {accessData.activation_entitlement.activations_used} /{" "}
                  {accessData.activation_entitlement.max_activations}
                  {" · "}Entitlement: {toSentence(accessData.entitlement_state)}
                  {" · "}Expires: {formatDate(accessData.activation_entitlement.expires_at)}
                </p>
              </div>
            </section>

            <section className="portal-surface space-y-4">
              <h2 className="text-xl font-semibold">Install SmartPOS</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                  <p className="text-sm font-semibold">Desktop Installer</p>
                  <p className="text-xs text-muted-foreground">
                    Recommended for production stores using local data storage on each device.
                  </p>
                  <Button
                    type="button"
                    variant="hero"
                    disabled={!installerDownloadAvailable}
                    onClick={() => {
                      if (!installerDownloadAvailable || !installerDownloadUrl) {
                        return;
                      }

                      trackMarketingEvent("marketing_installer_download_clicked", {
                        locale,
                        shop_code: accessData.shop_code,
                        protected_link: accessData.installer_download_protected,
                      });
                      void trackLicenseAction("installer_download");
                      window.open(installerDownloadUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <Download size={16} />
                    Download Installer
                  </Button>
                  {!installerDownloadUrl && (
                    <p className="text-xs text-muted-foreground">
                      Installer link is not available yet. Contact support if payment was already verified.
                    </p>
                  )}
                  {installerLinkExpiresAt && (
                    <p className="text-xs text-muted-foreground">
                      Link expires at: {formatDate(installerLinkExpiresAt)}
                    </p>
                  )}
                  {installerLinkExpired && (
                    <p className="text-xs text-destructive">
                      Installer link has expired. Refresh the account page or contact support for a new signed link.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {accessData.installer_download_protected
                      ? "Protected signed link is enabled."
                      : "Protected signed link is disabled. Enable protected links before production rollout."}
                  </p>
                  {installerChecksum ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground break-all">SHA-256: {installerChecksum}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyChecksum()}>
                        <Copy size={14} />
                        {checksumCopied ? "Checksum Copied" : "Copy Checksum"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-destructive">
                      Installer checksum is not configured. Contact support before installing in production.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-3">
                  <p className="text-sm font-semibold">PWA Install</p>
                  <p className="text-xs text-muted-foreground">
                    Optional browser-based install. Use this for quick onboarding or lightweight setups.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPwaInstalled || !installPromptEvent || isPwaInstalling}
                    onClick={() => {
                      void handleInstallPwa();
                    }}
                  >
                    <MonitorSmartphone size={16} />
                    {isPwaInstalled
                      ? "PWA Installed"
                      : isPwaInstalling
                        ? "Opening Install Prompt..."
                        : installPromptEvent
                          ? "Install PWA"
                          : "Install Prompt Unavailable"}
                  </Button>
                  {!installPromptEvent && !isPwaInstalled && (
                    <p className="text-xs text-muted-foreground">
                      If no install prompt appears, open this page in Chrome/Edge and use browser menu {"->"}{" "}
                      Install app.
                    </p>
                  )}
                  <div className="space-y-1 rounded-md border border-border p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Platform Notes</p>
                    <p>Windows/macOS/Linux: use Desktop Installer for full local storage and offline operation.</p>
                    <p>Android: PWA install works best in Chrome.</p>
                    <p>iOS: use Safari Share {"->"} Add to Home Screen (limited offline/background support).</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-surface-muted p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Installer Verification</p>
                <p>1. Download from this account page only.</p>
                <p>2. Compare installer SHA-256 with the checksum shown above.</p>
                <p>3. Do not run installer if checksum mismatch occurs.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
