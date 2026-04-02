import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const CTASection = () => {
  const { t } = useI18n();

  return (
    <section className="relative py-20 md:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/10 blur-[180px] pointer-events-none" />

      <div className="container mx-auto px-4 text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
          {t("cta.titlePart1")} <span className="text-gradient">{t("cta.titleHighlight")}</span>
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">{t("cta.description")}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button variant="hero" size="lg" className="text-base">
            {t("cta.primary")} <ArrowRight className="ml-1" size={18} />
          </Button>
          <Button variant="hero-outline" size="lg" className="text-base">
            {t("cta.secondary")}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
