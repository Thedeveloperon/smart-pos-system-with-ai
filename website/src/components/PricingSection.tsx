import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for getting started",
    features: ["1 device", "Up to 100 products", "Basic sales reports", "Email support"],
    cta: "Start Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For growing shops",
    features: ["Unlimited devices", "Unlimited products", "AI insights & alerts", "Inventory management", "Priority support"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$49",
    period: "/month",
    description: "Multi-location shops",
    features: ["Everything in Pro", "Multi-store management", "Advanced analytics", "API access", "Dedicated support"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

const PricingSection = () => (
  <section id="pricing" className="py-20 md:py-28 bg-background relative overflow-hidden">
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />
    <div className="container mx-auto px-4 relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <span className="text-primary font-semibold text-sm uppercase tracking-wide">Pricing</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
          Simple, Transparent Pricing
        </h2>
        <p className="text-muted-foreground text-lg">Start free. Upgrade when you&apos;re ready.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {plans.map((plan, i) => (
          <motion.div
            key={plan.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`glass-card p-8 relative ${
              plan.highlighted ? "border-primary/30 glow-primary-sm" : ""
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
            <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
            <div className="mt-6 mb-6">
              <span className="text-4xl font-bold text-foreground">{plan.price}</span>
              <span className="text-muted-foreground text-sm">{plan.period}</span>
            </div>
            <ul className="space-y-3 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check size={16} className="text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              variant={plan.highlighted ? "hero" : "outline"}
              className="w-full"
            >
              {plan.cta}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default PricingSection;
