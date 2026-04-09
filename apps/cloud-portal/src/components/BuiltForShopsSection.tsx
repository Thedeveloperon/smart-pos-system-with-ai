import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShoppingCart, BookOpen, Shirt, Gift, Sparkles, Store } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const icons = [ShoppingCart, BookOpen, Shirt, Gift, Sparkles, Store] as const;

const BuiltForShopsSection = () => {
  const { t, get } = useI18n();
  const shops = get<string[]>("builtForShops.shops");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (shops.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % shops.length);
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [shops.length]);

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

            const isActive = i === activeIndex;

            return (
              <motion.div
                key={shop}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className={`px-6 py-4 flex items-center gap-3 rounded-2xl border transition-all duration-700 ${
                  isActive
                    ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "glass-card hover:border-primary/30 hover:glow-primary-sm"
                }`}
              >
                <Icon size={20} className={isActive ? "text-primary-foreground" : "text-primary"} />
                <span className={`text-sm font-medium ${isActive ? "text-primary-foreground" : "text-foreground"}`}>{shop}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default BuiltForShopsSection;
