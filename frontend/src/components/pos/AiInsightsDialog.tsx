import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  createAiChatSession,
  createAiCheckoutSession,
  estimateAiInsights,
  fetchAiChatHistory,
  fetchAiChatSession,
  fetchAiCreditPacks,
  fetchAiInsightsHistory,
  fetchAiPaymentHistory,
  fetchAiWallet,
  generateAiInsights,
  postAiChatMessage,
  type AiCreditPack,
  type AiChatMessage,
  type AiChatSessionSummary,
  type AiCheckoutPaymentMethod,
  type AiInsightsEstimateResponse,
  type AiInsightsHistoryItem,
  type AiInsightsResponse,
  type AiInsightsUsageType,
  type AiPaymentHistoryItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AiInsightsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBalanceChange?: (balance: number) => void;
}

const USAGE_TYPE_OPTIONS: ReadonlyArray<{
  value: AiInsightsUsageType;
  label: string;
  description: string;
  multiplierLabel: string;
}> = [
  {
    value: "quick_insights",
    label: "Quick Insights",
    description: "Short operational answers with lower token usage.",
    multiplierLabel: "1.0x",
  },
  {
    value: "advanced_analysis",
    label: "Advanced Analysis",
    description: "Deeper trend and recommendation analysis.",
    multiplierLabel: "1.8x",
  },
  {
    value: "smart_reports",
    label: "Smart Reports",
    description: "Longer structured summaries for weekly/monthly reporting.",
    multiplierLabel: "3.0x",
  },
];

const PAYMENT_METHOD_OPTIONS: ReadonlyArray<{
  value: AiCheckoutPaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "card",
    label: "Card",
    description: "Open online checkout and pay instantly.",
  },
  {
    value: "bank_deposit",
    label: "Bank Deposit",
    description: "Submit deposit reference and slip URL for verification.",
  },
  {
    value: "cash",
    label: "Cash",
    description: "Submit cash reference for manual verification.",
  },
];

function getUsageTypeLabel(value: AiInsightsUsageType): string {
  return USAGE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "Quick Insights";
}

function getPaymentMethodLabel(value: string | null | undefined): string {
  if (!value) {
    return "Card";
  }

  const normalizedValue = value.trim().toLowerCase();
  const matched = PAYMENT_METHOD_OPTIONS.find((option) => option.value === normalizedValue);
  if (matched) {
    return matched.label;
  }

  if (normalizedValue === "bankdeposit") {
    return "Bank Deposit";
  }

  return normalizedValue.replace(/_/g, " ");
}

const AiInsightsDialog = ({ open, onOpenChange, onBalanceChange }: AiInsightsDialogProps) => {
  const [prompt, setPrompt] = useState("");
  const [usageType, setUsageType] = useState<AiInsightsUsageType>("quick_insights");
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  const [walletUpdatedAt, setWalletUpdatedAt] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<AiInsightsEstimateResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<AiInsightsHistoryItem[]>([]);
  const [paymentItems, setPaymentItems] = useState<AiPaymentHistoryItem[]>([]);
  const [creditPacks, setCreditPacks] = useState<AiCreditPack[]>([]);
  const [selectedPackCode, setSelectedPackCode] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<AiCheckoutPaymentMethod>("card");
  const [bankReference, setBankReference] = useState("");
  const [depositSlipUrl, setDepositSlipUrl] = useState("");
  const [insightResult, setInsightResult] = useState<AiInsightsResponse | null>(null);
  const [lastCheckoutUrl, setLastCheckoutUrl] = useState<string | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [isLoadingPacks, setIsLoadingPacks] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [isRefreshingWalletAndPayments, setIsRefreshingWalletAndPayments] = useState(false);
  const [chatSessions, setChatSessions] = useState<AiChatSessionSummary[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);

  const hasInsight = Boolean(insightResult?.insight?.trim());
  const selectedUsageTypeOption = useMemo(
    () => USAGE_TYPE_OPTIONS.find((option) => option.value === usageType) ?? USAGE_TYPE_OPTIONS[0],
    [usageType],
  );

  const walletLabel = useMemo(() => {
    if (walletCredits === null) {
      return "--";
    }

    return walletCredits.toFixed(2);
  }, [walletCredits]);

  const selectedPack = useMemo(
    () => creditPacks.find((item) => item.pack_code === selectedPackCode) ?? null,
    [creditPacks, selectedPackCode],
  );

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetchAiInsightsHistory(8);
      setHistoryItems(response.items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load AI insights history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadPayments = async () => {
    setIsLoadingPayments(true);
    try {
      const response = await fetchAiPaymentHistory(8);
      setPaymentItems(response.items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load payment history.");
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const loadCreditPacks = async () => {
    setIsLoadingPacks(true);
    try {
      const response = await fetchAiCreditPacks();
      setCreditPacks(response.items);
      setSelectedPackCode((previous) => {
        if (previous && response.items.some((item) => item.pack_code === previous)) {
          return previous;
        }

        return response.items[0]?.pack_code ?? "";
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load credit packs.");
    } finally {
      setIsLoadingPacks(false);
    }
  };

  const loadWallet = async () => {
    setIsLoadingWallet(true);
    try {
      const wallet = await fetchAiWallet();
      setWalletCredits(wallet.available_credits);
      setWalletUpdatedAt(wallet.updated_at);
      onBalanceChange?.(wallet.available_credits);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load AI wallet.");
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const loadChatSession = async (sessionId: string) => {
    setIsLoadingChat(true);
    try {
      const response = await fetchAiChatSession(sessionId, 80);
      setActiveChatSessionId(response.session.session_id);
      setChatMessages(response.messages);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load AI chat session.");
    } finally {
      setIsLoadingChat(false);
    }
  };

  const loadChatHistory = async () => {
    setIsLoadingChat(true);
    try {
      const response = await fetchAiChatHistory(20);
      setChatSessions(response.items);
      const firstSessionId = response.items[0]?.session_id ?? null;
      if (firstSessionId) {
        const sessionDetail = await fetchAiChatSession(firstSessionId, 80);
        setActiveChatSessionId(sessionDetail.session.session_id);
        setChatMessages(sessionDetail.messages);
      } else {
        setActiveChatSessionId(null);
        setChatMessages([]);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load AI chat history.");
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleCreateChatSession = async () => {
    setIsCreatingChatSession(true);
    try {
      const session = await createAiChatSession({
        title: "",
        usage_type: usageType,
      });
      setChatSessions((previous) => [session, ...previous.filter((item) => item.session_id !== session.session_id)]);
      setActiveChatSessionId(session.session_id);
      setChatMessages([]);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create chat session.");
    } finally {
      setIsCreatingChatSession(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setIsEstimating(false);
      return;
    }

    void Promise.all([loadWallet(), loadHistory(), loadPayments(), loadCreditPacks(), loadChatHistory()]);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setEstimate(null);
      return;
    }

    let isCancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsEstimating(true);
      try {
        const result = await estimateAiInsights({ prompt: normalizedPrompt, usage_type: usageType });
        if (!isCancelled) {
          setEstimate(result);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          setEstimate(null);
        }
      } finally {
        if (!isCancelled) {
          setIsEstimating(false);
        }
      }
    }, 350);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, prompt, usageType]);

  const handleGenerateInsight = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      toast.error("Enter a prompt to generate insights.");
      return;
    }

    if (estimate && !estimate.can_afford) {
      toast.error(`Insufficient credits. At least ${estimate.reserve_credits.toFixed(2)} credits are required.`);
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateAiInsights({ prompt: normalizedPrompt, usage_type: usageType });
      setInsightResult(result);
      setWalletCredits(result.remaining_credits);
      setWalletUpdatedAt(result.completed_at);
      setEstimate((previousEstimate) => {
        if (!previousEstimate) {
          return previousEstimate;
        }

        return {
          ...previousEstimate,
          available_credits: result.remaining_credits,
          can_afford: result.remaining_credits >= previousEstimate.reserve_credits,
        };
      });
      onBalanceChange?.(result.remaining_credits);
      await loadHistory();
      toast.success(`Insight generated. ${result.credits_used.toFixed(2)} credits used.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to generate AI insight.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendChatMessage = async () => {
    const normalizedMessage = chatInput.trim();
    if (!normalizedMessage) {
      toast.error("Type a chat message first.");
      return;
    }

    setIsSendingChatMessage(true);
    try {
      let sessionId = activeChatSessionId;
      if (!sessionId) {
        const created = await createAiChatSession({
          title: "",
          usage_type: usageType,
        });
        sessionId = created.session_id;
        setChatSessions((previous) => [created, ...previous.filter((item) => item.session_id !== created.session_id)]);
        setActiveChatSessionId(created.session_id);
      }

      const randomPart =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await postAiChatMessage(sessionId, {
        message: normalizedMessage,
        usage_type: usageType,
        idempotency_key: `chat-${randomPart}`,
      });

      setChatMessages((previous) => {
        const map = new Map<string, AiChatMessage>();
        previous.forEach((message) => {
          map.set(message.message_id, message);
        });
        map.set(response.user_message.message_id, response.user_message);
        map.set(response.assistant_message.message_id, response.assistant_message);
        return Array.from(map.values()).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      });
      setChatInput("");
      setWalletCredits(response.remaining_credits);
      setWalletUpdatedAt(new Date().toISOString());
      onBalanceChange?.(response.remaining_credits);
      await loadChatHistory();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to send chat message.");
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const handleRefreshWalletAndPayments = async () => {
    setIsRefreshingWalletAndPayments(true);
    try {
      await Promise.all([loadWallet(), loadPayments()]);
      toast.success("Wallet and payment status refreshed.");
    } finally {
      setIsRefreshingWalletAndPayments(false);
    }
  };

  const handleStartCheckout = async () => {
    if (!selectedPack) {
      toast.error("Select a credit pack first.");
      return;
    }

    const resolvedBankReference = bankReference.trim() || undefined;
    const resolvedDepositSlipUrl = depositSlipUrl.trim() || undefined;

    setIsCreatingCheckout(true);
    try {
      const randomPart =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const result = await createAiCheckoutSession({
        pack_code: selectedPack.pack_code,
        payment_method: selectedPaymentMethod,
        bank_reference: selectedPaymentMethod === "card" ? undefined : resolvedBankReference,
        deposit_slip_url: selectedPaymentMethod === "bank_deposit" ? resolvedDepositSlipUrl : undefined,
        idempotency_key: `checkout-${randomPart}`,
      });

      const method = (result.payment_method || selectedPaymentMethod).toString().trim().toLowerCase();
      const isCardMethod = method === "card";
      setLastCheckoutUrl(isCardMethod ? result.checkout_url ?? null : null);
      await loadPayments();

      if (isCardMethod && result.checkout_url) {
        const popup = window.open(result.checkout_url, "_blank", "noopener,noreferrer");
        if (popup) {
          toast.success("Checkout opened. Complete payment, then refresh wallet status.");
        } else {
          toast.success("Checkout session created. Open the checkout link below.");
        }
      } else if (isCardMethod) {
        toast.success("Checkout session created. Waiting for payment confirmation webhook.");
      } else {
        toast.success("Payment details submitted. Awaiting manual verification before credits are added.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create checkout session.");
    } finally {
      setIsCreatingCheckout(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Insights
          </DialogTitle>
          <DialogDescription>
            Ask for sales and operations insights. Credits are deducted per request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Available credits: <span className="font-semibold">{walletLabel}</span>
                </p>
                {isLoadingWallet && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {walletUpdatedAt ? `Updated: ${new Date(walletUpdatedAt).toLocaleString()}` : "Not synced yet"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRefreshWalletAndPayments()}
                  disabled={isRefreshingWalletAndPayments}
                >
                  {isRefreshingWalletAndPayments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Buy Credits</p>
              <p className="text-xs text-muted-foreground">
                Choose a pack and payment method. Card checkout is instant; cash and bank deposits require manual verification.
              </p>
            </div>

            {isLoadingPacks ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading credit packs...
              </div>
            ) : creditPacks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No credit packs configured.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {creditPacks.map((pack) => {
                  const isSelected = pack.pack_code === selectedPackCode;
                  return (
                    <button
                      key={pack.pack_code}
                      type="button"
                      className={`rounded-md border p-3 text-left transition ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/20 hover:border-primary/40"
                      }`}
                      onClick={() => setSelectedPackCode(pack.pack_code)}
                    >
                      <p className="text-sm font-semibold text-foreground">{pack.credits.toFixed(0)} credits</p>
                      <p className="text-xs text-muted-foreground">
                        {pack.currency} {pack.price.toFixed(2)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Payment Method</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {PAYMENT_METHOD_OPTIONS.map((option) => {
                  const isSelected = selectedPaymentMethod === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-md border p-3 text-left transition ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/20 hover:border-primary/40"
                      }`}
                      onClick={() => {
                        setSelectedPaymentMethod(option.value);
                        if (option.value !== "card") {
                          setLastCheckoutUrl(null);
                        }
                      }}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPaymentMethod !== "card" && (
              <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
                <label className="block text-xs font-medium text-foreground">
                  Reference Number
                  <input
                    type="text"
                    value={bankReference}
                    onChange={(event) => setBankReference(event.target.value)}
                    placeholder={
                      selectedPaymentMethod === "cash"
                        ? "Cash receipt/reference number"
                        : "Bank deposit reference number"
                    }
                    className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                  />
                </label>

                {selectedPaymentMethod === "bank_deposit" && (
                  <label className="block text-xs font-medium text-foreground">
                    Deposit Slip URL
                    <input
                      type="url"
                      value={depositSlipUrl}
                      onChange={(event) => setDepositSlipUrl(event.target.value)}
                      placeholder="https://example.com/proof/deposit-slip.pdf"
                      className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                    />
                  </label>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleStartCheckout()} disabled={isCreatingCheckout || !selectedPack}>
                {isCreatingCheckout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {selectedPaymentMethod === "card" ? "Start Checkout" : "Submit for Verification"}
              </Button>
              {selectedPaymentMethod === "card" && lastCheckoutUrl && (
                <a
                  href={lastCheckoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open checkout link
                </a>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">Usage Type</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {USAGE_TYPE_OPTIONS.map((option) => {
                  const isSelected = option.value === usageType;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-md border p-3 text-left transition ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border bg-muted/20 hover:border-primary/40"
                      }`}
                      onClick={() => setUsageType(option.value)}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                      <p className="mt-1 text-xs font-medium text-foreground">Credit rate: {option.multiplierLabel}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-sm font-medium">Prompt</p>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Analyze today's low-margin items and suggest 3 promotion ideas for tomorrow."
              className="min-h-[140px]"
            />
            {estimate && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="grid gap-1 sm:grid-cols-2">
                  <p>
                    Usage type: <span className="font-semibold text-foreground">{selectedUsageTypeOption.label}</span>
                  </p>
                  <p>
                    Estimated usage:{" "}
                    <span className="font-semibold text-foreground">{estimate.estimated_charge_credits.toFixed(2)}</span> credits
                  </p>
                  <p>
                    Reserve required:{" "}
                    <span className="font-semibold text-foreground">{estimate.reserve_credits.toFixed(2)}</span> credits
                  </p>
                  {estimate.daily_remaining_credits >= 0 && (
                    <p>
                      Daily remaining:{" "}
                      <span className="font-semibold text-foreground">{estimate.daily_remaining_credits.toFixed(2)}</span> credits
                    </p>
                  )}
                </div>
              </div>
            )}
            {isEstimating && (
              <p className="text-xs text-muted-foreground">Calculating credit estimate...</p>
            )}
            {estimate && !estimate.can_afford && (
              <Alert variant="destructive">
                <AlertDescription>
                  Low balance. Buy more credits before generating this insight.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end">
              <Button
                onClick={() => void handleGenerateInsight()}
                disabled={isGenerating || Boolean(estimate && !estimate.can_afford)}
              >
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Insight
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">AI Chat</p>
                <p className="text-xs text-muted-foreground">
                  Grounded responses with citations from POS report buckets.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={activeChatSessionId ?? ""}
                  onChange={(event) => {
                    const nextSessionId = event.target.value;
                    if (nextSessionId) {
                      void loadChatSession(nextSessionId);
                    }
                  }}
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="">No session</option>
                  {chatSessions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCreateChatSession()}
                  disabled={isCreatingChatSession}
                >
                  {isCreatingChatSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  New Chat
                </Button>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-2.5">
              {isLoadingChat ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading chat...
                </div>
              ) : chatMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground">Start a conversation to see grounded chat responses.</p>
              ) : (
                chatMessages.map((message) => (
                  <div
                    key={message.message_id}
                    className={`rounded-md border p-2 text-xs ${
                      message.role === "assistant"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/70 bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {message.role === "assistant" ? "Assistant" : message.role === "user" ? "You" : "System"}
                      </span>
                      <span className="text-muted-foreground">{new Date(message.created_at).toLocaleString()}</span>
                      {message.charged_credits > 0 ? (
                        <span className="ml-auto text-muted-foreground">{message.charged_credits.toFixed(2)} credits</span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-foreground/90">{message.content || message.error_message || "-"}</p>
                    {message.citations.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded-md border border-border/70 bg-background/80 p-2">
                        <p className="text-[11px] font-medium text-foreground">Citations</p>
                        {message.citations.map((citation) => (
                          <p key={`${message.message_id}-${citation.bucket_key}`} className="text-[11px] text-muted-foreground">
                            {citation.title}: {citation.summary}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <Textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask: Which items are low stock, worst-selling this week, and what should I restock next month?"
                className="min-h-[96px]"
              />
              <div className="flex justify-end">
                <Button type="button" onClick={() => void handleSendChatMessage()} disabled={isSendingChatMessage}>
                  {isSendingChatMessage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send Chat Message
                </Button>
              </div>
            </div>
          </div>

          {hasInsight && insightResult && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Insight</p>
              <div className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {insightResult.insight}
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>
                  Usage type: <span className="font-medium text-foreground">{getUsageTypeLabel(insightResult.usage_type)}</span>
                </div>
                <div>
                  Credits used: <span className="font-medium text-foreground">{insightResult.credits_used.toFixed(2)}</span>
                </div>
                <div>
                  Tokens: <span className="font-medium text-foreground">{insightResult.input_tokens} in / {insightResult.output_tokens} out</span>
                </div>
                <div>
                  Remaining: <span className="font-medium text-foreground">{insightResult.remaining_credits.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent AI Requests</p>
              {isLoadingHistory && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {historyItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No AI requests yet.</p>
            ) : (
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div key={item.request_id} className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">
                        {item.status === "succeeded" ? "Succeeded" : item.status === "failed" ? "Failed" : "Pending"}
                      </span>
                      <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                      <span className="ml-auto text-muted-foreground">
                        {item.credits_used.toFixed(2)} credits
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.input_tokens} in / {item.output_tokens} out tokens • {getUsageTypeLabel(item.usage_type)}
                    </p>
                    {item.error_message ? (
                      <p className="mt-1 text-xs text-destructive">{item.error_message}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent Credit Purchases</p>
              {isLoadingPayments && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {paymentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No credit purchases yet.</p>
            ) : (
              <div className="space-y-2">
                {paymentItems.map((item) => (
                  <div key={item.payment_id} className="rounded-md border border-border/70 bg-muted/30 p-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-foreground">{item.payment_status.replace("_", " ")}</span>
                      <span className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {getPaymentMethodLabel(item.payment_method)}
                      </span>
                      <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                      <span className="ml-auto text-muted-foreground">
                        {item.credits.toFixed(0)} credits ({item.currency} {item.amount.toFixed(2)})
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Reference: {item.external_reference}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiInsightsDialog;
