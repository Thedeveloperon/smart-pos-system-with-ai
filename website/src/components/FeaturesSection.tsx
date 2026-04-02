import { motion } from "framer-motion";
import {
  Smartphone,
  Zap,
  BarChart3,
  Package,
  Clock,
  ShoppingBag,
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "One-Screen Checkout",
    description: "Tap, sell, and complete payments from one clean screen.",
  },
  {
    icon: Package,
    title: "AI Stock Alerts",
    description: "Know what's running low before it becomes a problem.",
  },
  {
    icon: BarChart3,
    title: "Smart Sales Insights",
    description: "See what sold, what slowed down, and what needs attention.",
  },
  {
    icon: Smartphone,
    title: "Works on Devices You Already Own",
    description: "Use your phone, tablet, or computer — no expensive setup required.",
  },
  {
    icon: Clock,
    title: "Setup in Minutes",
    description: "Add products fast and start billing without complicated onboarding.",
  },
  {
    icon: ShoppingBag,
    title: "Built for Real Small Shops",
    description: "Designed for groceries, bookshops, boutiques, and everyday retail.",
  },
];

const FeaturesSection = () => (
  <section id="features" className="py-20 md:py-28 bg-background relative overflow-hidden">
    <div className="absolute top-1/2 left-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
    <div className="container mx-auto px-4 relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-primary font-semibold text-sm uppercase tracking-wide">Features</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
          Everything a Small Shop Needs — <span className="text-gradient">Without the Complexity</span>
        </h2>
        <p className="text-muted-foreground text-lg">
          Simple selling, stock control, and AI-powered insights in one modern POS.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="group glass-card p-6 hover:border-primary/30 hover:glow-primary-sm transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
              <f.icon className="text-primary" size={22} />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default FeaturesSection;
