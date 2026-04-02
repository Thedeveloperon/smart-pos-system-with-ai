import { motion } from "framer-motion";
import { BrainCircuit, TrendingUp, AlertTriangle, MessageSquare } from "lucide-react";

const insights = [
  { icon: MessageSquare, text: "What sold most today?", type: "question" as const },
  { icon: AlertTriangle, text: "Milk Powder is likely to run out tomorrow.", type: "alert" as const },
  { icon: TrendingUp, text: "Card payments increased 14% this week.", type: "insight" as const },
  { icon: BrainCircuit, text: "Biscuits sold better than last week. Consider restocking soon.", type: "insight" as const },
];

const AIAssistantSection = () => (
  <section className="py-20 md:py-28 bg-background relative overflow-hidden">
    <div className="absolute top-1/2 right-0 w-[500px] h-[500px] rounded-full bg-accent/5 blur-[150px] pointer-events-none" />

    <div className="container mx-auto px-4 relative z-10">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-accent font-semibold text-sm uppercase tracking-wide">AI Assistant</span>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mt-3 mb-4">
            Meet Your <span className="text-gradient">AI</span> Shop Assistant
          </h2>
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            SmartPOS helps you understand your business faster with low-stock alerts, sales summaries, smart search, and instant answers.
          </p>
          <div className="space-y-3">
            {["Instant low-stock warnings", "Daily sales summaries", "Smart product search", "Natural language questions"].map((b) => (
              <div key={b} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-foreground text-sm">{b}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="glass-card p-6 glow-primary-sm"
        >
          <div className="flex items-center gap-2 mb-5">
            <BrainCircuit size={18} className="text-accent" />
            <span className="text-foreground font-semibold font-heading">SmartPOS AI</span>
          </div>
          <div className="space-y-3">
            {insights.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.3 + i * 0.1 }}
                className={`glass-card p-4 flex items-start gap-3 ${
                  item.type === "question" ? "border-primary/20" : item.type === "alert" ? "border-amber-400/20" : "border-accent/20"
                }`}
              >
                <item.icon
                  size={16}
                  className={`shrink-0 mt-0.5 ${
                    item.type === "question" ? "text-primary" : item.type === "alert" ? "text-amber-400" : "text-accent"
                  }`}
                />
                <span className="text-foreground text-sm leading-relaxed">{item.text}</span>
              </motion.div>
            ))}
          </div>
          <div className="glass-card p-3 mt-4 flex items-center gap-2">
            <MessageSquare size={14} className="text-muted-foreground" />
            <span className="text-muted-foreground text-sm">Ask SmartPOS anything...</span>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

export default AIAssistantSection;
