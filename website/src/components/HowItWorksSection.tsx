import { motion } from "framer-motion";

const steps = [
  { number: "01", title: "Add Products", description: "Create your items quickly with price, stock, and barcode." },
  { number: "02", title: "Start Selling", description: "Use one simple billing screen to process sales fast." },
  { number: "03", title: "Let AI Assist", description: "Get stock warnings, sales insights, and daily summaries automatically." },
];

const HowItWorksSection = () => (
  <section id="how-it-works" className="py-20 md:py-28 bg-secondary/30 relative overflow-hidden">
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
    <div className="container mx-auto px-4 relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-primary font-semibold text-sm uppercase tracking-wide">How It Works</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
          Start in <span className="text-gradient">Minutes</span>
        </h2>
        <p className="text-muted-foreground text-lg">
          A simple setup flow designed for busy shop owners.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        {steps.map((s, i) => (
          <motion.div
            key={s.number}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.12 }}
            className="glass-card p-6 text-center relative group hover:border-primary/30 transition-all"
          >
            <div className="text-5xl font-bold text-primary/15 font-heading mb-4 group-hover:text-primary/25 transition-colors">{s.number}</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">{s.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{s.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorksSection;
