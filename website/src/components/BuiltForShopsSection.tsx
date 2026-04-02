import { motion } from "framer-motion";
import { ShoppingCart, BookOpen, Shirt, Gift, Sparkles, Store } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const icons = [ShoppingCart, BookOpen, Shirt, Gift, Sparkles, Store] as const;

const BuiltForShopsSection = () => {
  const { t, get } = useI18n();
  const shops = get<string[]>("builtForShops.shops");

  return (
    <section className="py-20 md:py-28 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-primary font-semibold text-sm uppercase tracking-wide">{t("builtForShops.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("builtForShops.titlePart1")} <span className="text-gradient">{t("builtForShops.titleHighlight")}</span> {t("builtForShops.titlePart2")}
          </h2>
        </div>
        <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
          {shops.map((shop, i) => {
            const Icon = icons[i];
            if (!Icon) {
              return null;
            }

            return (
              <motion.div
                key={shop}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="glass-card px-6 py-4 flex items-center gap-3 hover:border-primary/30 hover:glow-primary-sm transition-all"
              >
                <Icon size={20} className="text-primary" />
                <span className="text-foreground text-sm font-medium">{shop}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BuiltForShopsSection;
