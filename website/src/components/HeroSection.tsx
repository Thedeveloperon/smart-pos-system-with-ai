import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Play, TrendingUp, AlertTriangle, BrainCircuit, MessageSquare } from "lucide-react";

const HeroSection = () => (
  <section className="relative bg-hero pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
    {/* Ambient glows */}
    <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[150px] pointer-events-none" />
    <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/6 blur-[120px] pointer-events-none" />
    {/* Subtle grid */}
    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

    <div className="container mx-auto px-4 relative z-10">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full glass-card text-primary text-xs font-semibold tracking-wide uppercase mb-6 border-primary/20">
            Built for Small Shops
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-hero-foreground leading-[1.1] mb-6">
            The <span className="text-gradient">AI</span> POS Built<br />
            for Small Shops
          </h1>
          <p className="text-hero-muted text-lg md:text-xl max-w-lg mb-8 leading-relaxed">
            Run sales, track stock, and get instant business insights from one smart POS system built for groceries, bookshops, clothing shops, and more.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button variant="hero" size="lg" className="text-base">
              Start Free Trial <ArrowRight className="ml-1" size={18} />
            </Button>
            <Button variant="hero-outline" size="lg" className="text-base">
              <Play size={18} className="mr-1" /> Watch Product Tour
            </Button>
          </div>
          <p className="text-hero-muted/50 text-sm mt-5">
            Runs on phone, tablet, or desktop â€” no bulky setup or extra hardware.
          </p>
        </motion.div>

        {/* Product mockup cards */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative hidden lg:block"
        >
          {/* Main dashboard card */}
          <div className="glass-card p-5 glow-primary-sm w-[320px] ml-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-foreground text-sm font-semibold font-heading">SmartPOS</span>
            </div>
            <div className="space-y-3">
              <div className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-primary" />
                  <span className="text-muted-foreground text-xs">Today&apos;s Sales</span>
                </div>
                <span className="text-foreground text-xl font-bold font-heading">Rs. 28,450</span>
              </div>
              <div className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-muted-foreground text-xs">Low Stock</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground text-sm font-medium">Milk Powder</span>
                  <span className="text-amber-400 text-xs font-semibold">2 Left</span>
                </div>
              </div>
              <div className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <BrainCircuit size={14} className="text-accent" />
                  <span className="text-muted-foreground text-xs">AI Insights</span>
                </div>
                <p className="text-foreground text-xs leading-relaxed">
                  Biscuit sales increased 18% this week. Consider restocking soon.
                </p>
              </div>
              <div className="glass-card p-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-primary" />
                  <span className="text-muted-foreground text-xs">Ask SmartPOS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating low stock card */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-4 right-0 glass-card p-4 w-[200px] glow-primary-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-foreground text-xs font-semibold">Low Stock</span>
            </div>
            <div className="space-y-1.5">
              {["Milk Powder", "Pens", "Exercise Books"].map((item) => (
                <div key={item} className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">{item}</span>
                  <span className="text-amber-400/70 text-[10px]">Below 10</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Floating billing card */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute -bottom-6 right-[-20px] glass-card p-4 w-[220px] glow-primary-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit size={14} className="text-accent" />
              <span className="text-foreground text-xs font-semibold">AI Insights</span>
            </div>
            <div className="glass-card p-2 mb-2">
              <span className="text-muted-foreground text-[10px]">Ask SmartPOS</span>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "Milk Powder", price: "Rs. 200.00" },
                { name: "Biscuits", price: "Rs. 360.00" },
                { name: "Soap", price: "Rs. 120.00" },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="text-foreground text-xs">{item.name}</span>
                  <span className="text-primary text-xs font-medium">{item.price}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              {["Cash", "Card", "Other"].map((m) => (
                <span key={m} className="text-[10px] text-muted-foreground glass-card px-2 py-1">{m}</span>
              ))}
              <span className="ml-auto text-foreground text-xs font-bold">Rs. 28,450</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  </section>
);

export default HeroSection;

