import { motion } from "framer-motion";
import { ShoppingCart, BookOpen, Shirt, Gift, Sparkles, Store } from "lucide-react";

const shops = [
  { icon: ShoppingCart, name: "Grocery Shops" },
  { icon: BookOpen, name: "Bookshops" },
  { icon: Shirt, name: "Clothing Stores" },
  { icon: Gift, name: "Gift Shops" },
  { icon: Sparkles, name: "Cosmetic Stores" },
  { icon: Store, name: "Mini Marts" },
];

const BuiltForShopsSection = () => (
  <section className="py-20 md:py-28 bg-background relative overflow-hidden">
    <div className="container mx-auto px-4">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="text-primary font-semibold text-sm uppercase tracking-wide">Who It&apos;s For</span>
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
          Built for the Shops That Need <span className="text-gradient">Simplicity</span> Most
        </h2>
      </div>
      <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
        {shops.map((s, i) => (
          <motion.div
            key={s.name}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            className="glass-card px-6 py-4 flex items-center gap-3 hover:border-primary/30 hover:glow-primary-sm transition-all"
          >
            <s.icon size={20} className="text-primary" />
            <span className="text-foreground text-sm font-medium">{s.name}</span>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default BuiltForShopsSection;
