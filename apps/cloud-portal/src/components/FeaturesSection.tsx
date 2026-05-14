import Image from "next/image";
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
    <section id="features" className="pt-6 pb-20 md:pt-8 md:pb-28 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wide">{t("features.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("features.titlePart1")} <span className="text-gradient">{t("features.titleHighlight")}</span>
          </h2>
          <p className="text-muted-foreground text-lg">{t("features.description")}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {features.map((feature, i) => {
            const Icon = icons[i];
            if (!Icon) {
              return null;
            }

            const isCheckoutCard = i === 0;

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-7 md:p-8 min-h-[190px] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35"
              >
                {isCheckoutCard ? (
                  <>
                    <Image
                      src="/images/marketing/features/one-screen-checkout.jpg"
                      alt="One-screen checkout interface"
                      fill
                      className="object-cover object-right"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-50 via-slate-50/95 to-slate-50/45" />
                  </>
                ) : (
                  <div
                    className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.10),transparent_40%)]"
                  />
                )}
                <div
                  className="relative z-10 w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-primary/12 transition-colors group-hover:bg-primary/20"
                >
                  <Icon className="text-primary" size={22} />
                </div>
                <h3 className="relative z-10 text-2xl font-bold mb-2 text-slate-700">
                  {feature.title}
                </h3>
                <p className="relative z-10 text-base leading-relaxed text-slate-500">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
