import { motion } from "framer-motion";
import {
  Smartphone,
  Zap,
  BarChart3,
  Package,
  Clock,
  ShoppingBag,
} from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

type FeatureItem = {
  title: string;
  description: string;
};

const icons = [Zap, Package, BarChart3, Smartphone, Clock, ShoppingBag] as const;

const FeaturesSection = () => {
  const { t, get } = useI18n();
  const features = get<FeatureItem[]>("features.items");

  return (
    <section id="features" className="py-20 md:py-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wide">{t("features.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("features.titlePart1")} <span className="text-gradient">{t("features.titleHighlight")}</span>
          </h2>
          <p className="text-muted-foreground text-lg">{t("features.description")}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => {
            const Icon = icons[i];
            if (!Icon) {
              return null;
            }

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group glass-card p-6 hover:border-primary/30 hover:glow-primary-sm transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <Icon className="text-primary" size={22} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
