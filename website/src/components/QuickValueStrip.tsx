import { motion } from "framer-motion";
import { Smartphone, Clock, GraduationCap, HardDriveDownload } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

const icons = [Smartphone, Clock, GraduationCap, HardDriveDownload] as const;

const QuickValueStrip = () => {
  const { get } = useI18n();
  const values = get<string[]>("quickValue.items");

  return (
    <section className="py-8 bg-background border-y border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8">
          {values.map((text, i) => {
            const Icon = icons[i];
            if (!Icon) {
              return null;
            }

            return (
              <motion.div
                key={text}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className="glass-card px-5 py-3 flex items-center gap-3 glow-primary-sm"
              >
                <Icon size={18} className="text-primary shrink-0" />
                <span className="text-foreground text-sm font-medium whitespace-nowrap">{text}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default QuickValueStrip;
