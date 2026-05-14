import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const BeforeAfterSection = () => {
  const { t, get } = useI18n();
  const beforeItems = get<string[]>("beforeAfter.beforeItems");
  const afterItems = get<string[]>("beforeAfter.afterItems");

  return (
    <section className="py-20 md:py-28 bg-secondary/30 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wide">{t("beforeAfter.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("beforeAfter.titlePart1")} <span className="text-gradient">{t("beforeAfter.titleHighlight")}</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="glass-card p-6 border-destructive/20"
          >
            <h3 className="text-lg font-semibold text-foreground mb-5">{t("beforeAfter.beforeTitle")}</h3>
            <div className="space-y-4">
              {beforeItems.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                    <X size={14} className="text-destructive" />
                  </div>
                  <span className="text-muted-foreground text-sm">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="glass-card p-6 border-primary/20 glow-primary-sm"
          >
            <h3 className="text-lg font-semibold text-foreground mb-5">{t("beforeAfter.afterTitle")}</h3>
            <div className="space-y-4">
              {afterItems.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Check size={14} className="text-primary" />
                  </div>
                  <span className="text-foreground text-sm">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default BeforeAfterSection;
