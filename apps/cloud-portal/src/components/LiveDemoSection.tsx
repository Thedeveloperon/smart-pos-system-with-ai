import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, Database, FlaskConical, ShieldCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";

type DemoCard = {
  id: string;
  title: string;
  query: string;
  summary: string;
  confidence: string;
  citations: string[];
};

const LiveDemoSection = () => {
  const { t, get } = useI18n();
  const cards = useMemo(() => get<DemoCard[]>("liveDemo.cards") ?? [], [get]);
  const [mode, setMode] = useState<"mock" | "sandbox">("mock");
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? "");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!cards.some((item) => item.id === selectedId)) {
      setSelectedId(cards[0]?.id ?? "");
    }
  }, [cards, selectedId]);

  const activeCard = useMemo(
    () => cards.find((item) => item.id === selectedId) ?? cards[0],
    [cards, selectedId],
  );

  const handleRun = () => {
    setIsRunning(true);
    window.setTimeout(() => {
      setIsRunning(false);
    }, 650);
  };

  return (
    <section id="live-demo" className="py-20 md:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[650px] h-[650px] rounded-full bg-accent/5 blur-[170px] pointer-events-none" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-accent font-semibold text-sm uppercase tracking-wide">{t("liveDemo.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("liveDemo.titlePart1")} <span className="text-gradient">{t("liveDemo.titleHighlight")}</span> {t("liveDemo.titlePart2")}
          </h2>
          <p className="text-muted-foreground text-lg">{t("liveDemo.description")}</p>
        </div>

        <div className="glass-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-glass-border/80">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm text-primary">
              <ShieldCheck size={14} />
              {t("liveDemo.readOnlyTag")}
            </div>
            <div className="inline-flex rounded-full border border-glass-border bg-glass/40 p-1">
              <button
                type="button"
                onClick={() => setMode("mock")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "mock" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Database size={13} className="inline-block mr-1" />
                {t("liveDemo.modeMock")}
              </button>
              <button
                type="button"
                onClick={() => setMode("sandbox")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "sandbox" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FlaskConical size={13} className="inline-block mr-1" />
                {t("liveDemo.modeSandbox")}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] pt-5">
            <div className="space-y-2">
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedId(card.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all ${
                    selectedId === card.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-glass-border bg-glass/40 hover:border-primary/30"
                  }`}
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("liveDemo.queryLabel")}</p>
                  <p className="text-sm text-foreground leading-relaxed">{card.query}</p>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-glass-border bg-black/20 p-4 md:p-5 min-h-[280px]">
              {mode === "sandbox" ? (
                <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                  <div>
                    <FlaskConical className="mx-auto mb-3 text-accent" size={22} />
                    <p className="text-sm">{t("liveDemo.sandboxNotice")}</p>
                  </div>
                </div>
              ) : activeCard ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="text-base font-semibold text-foreground">{activeCard.title}</h3>
                    <Button size="sm" variant="hero" onClick={handleRun} disabled={isRunning}>
                      <Play size={14} className="mr-1" />
                      {isRunning ? t("liveDemo.running") : t("liveDemo.run")}
                    </Button>
                  </div>

                  <motion.div
                    key={`${activeCard.id}-${isRunning ? "run" : "idle"}`}
                    initial={{ opacity: 0.35, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div className="rounded-lg border border-glass-border bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("liveDemo.resultLabel")}</p>
                      <p className="text-sm text-foreground leading-relaxed">{activeCard.summary}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                        {t("liveDemo.confidence")}: {activeCard.confidence}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                        <FileText size={12} />
                        {t("liveDemo.citations")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {activeCard.citations.map((citation) => (
                          <span key={citation} className="rounded-md border border-glass-border px-2 py-1 text-xs text-muted-foreground">
                            {citation}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  {t("liveDemo.empty")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveDemoSection;
