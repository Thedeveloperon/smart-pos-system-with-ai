import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  createAiCheckoutSession,
  estimateAiInsights,
  fetchAiCreditPacks,
  fetchAiInsightsHistory,
  fetchAiPaymentHistory,
  fetchAiWallet,
  generateAiInsights,
  type AiCreditPack,
  type AiInsightsEstimateResponse,
  type AiInsightsHistoryItem,
  type AiInsightsResponse,
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

const AiInsightsDialog = ({ open, onOpenChange, onBalanceChange }: AiInsightsDialogProps) => {
  const [prompt, setPrompt] = useState("");
  const [walletCredits, setWalletCredits] = useState<number | null>(null);
  const [walletUpdatedAt, setWalletUpdatedAt] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<AiInsightsEstimateResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<AiInsightsHistoryItem[]>([]);
  const [paymentItems, setPaymentItems] = useState<AiPaymentHistoryItem[]>([]);
  const [creditPacks, setCreditPacks] = useState<AiCreditPack[]>([]);
  const [selectedPackCode, setSelectedPackCode] = useState("");
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

  const hasInsight = Boolean(insightResult?.insight?.trim());

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

  useEffect(() => {
    if (!open) {
      setIsEstimating(false);
      return;
    }

    void Promise.all([loadWallet(), loadHistory(), loadPayments(), loadCreditPacks()]);
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
        const result = await estimateAiInsights({ prompt: normalizedPrompt });
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
  }, [open, prompt]);

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
      const result = await generateAiInsights({ prompt: normalizedPrompt });
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

    setIsCreatingCheckout(true);
    try {
      const randomPart =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const result = await createAiCheckoutSession({
        pack_code: selectedPack.pack_code,
        idempotency_key: `checkout-${randomPart}`,
      });

      setLastCheckoutUrl(result.checkout_url ?? null);
      await loadPayments();

      if (result.checkout_url) {
        const popup = window.open(result.checkout_url, "_blank", "noopener,noreferrer");
        if (popup) {
          toast.success("Checkout opened. Complete payment, then refresh wallet status.");
        } else {
          toast.success("Checkout session created. Open the checkout link below.");
        }
      } else {
        toast.success("Checkout session created. Waiting for payment confirmation webhook.");
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
                Choose a pack and complete checkout. Wallet updates automatically after payment webhook confirmation.
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

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleStartCheckout()} disabled={isCreatingCheckout || !selectedPack}>
                {isCreatingCheckout ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Start Checkout
              </Button>
              {lastCheckoutUrl && (
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

          {hasInsight && insightResult && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Insight</p>
              <div className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {insightResult.insight}
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
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
                      {item.input_tokens} in / {item.output_tokens} out tokens
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
