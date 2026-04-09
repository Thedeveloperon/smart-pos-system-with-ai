import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";

type Step = {
  number: string;
  title: string;
  description: string;
};

const HowItWorksSection = () => {
  const { t, get } = useI18n();
  const steps = get<Step[]>("howItWorks.steps");

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-secondary/30 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-primary font-semibold text-sm uppercase tracking-wide">{t("howItWorks.badge")}</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            {t("howItWorks.titlePart1")} <span className="text-gradient">{t("howItWorks.titleHighlight")}</span>
          </h2>
          <p className="text-muted-foreground text-lg">{t("howItWorks.description")}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
              className="glass-card p-6 text-center relative group hover:border-primary/30 transition-all"
            >
              <div className="text-5xl font-bold text-primary/15 font-heading mb-4 group-hover:text-primary/25 transition-colors">{step.number}</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
