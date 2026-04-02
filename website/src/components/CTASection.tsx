import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => (
  <section className="relative py-20 md:py-28 overflow-hidden">
    {/* Strong background glow */}
    <div className="absolute inset-0 bg-background" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full bg-primary/10 blur-[180px] pointer-events-none" />

    <div className="container mx-auto px-4 text-center relative z-10">
      <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
        Start Selling <span className="text-gradient">Smarter</span>
      </h2>
      <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
        Try SmartPOS and see how simple modern shop management can be.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Button variant="hero" size="lg" className="text-base">
          Start Free Trial <ArrowRight className="ml-1" size={18} />
        </Button>
        <Button variant="hero-outline" size="lg" className="text-base">
          Book a Demo
        </Button>
      </div>
    </div>
  </section>
);

export default CTASection;
