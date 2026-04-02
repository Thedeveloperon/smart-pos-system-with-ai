"use client";

import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import QuickValueStrip from "@/components/QuickValueStrip";
import FeaturesSection from "@/components/FeaturesSection";
import AIAssistantSection from "@/components/AIAssistantSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import BuiltForShopsSection from "@/components/BuiltForShopsSection";
import BeforeAfterSection from "@/components/BeforeAfterSection";
import PricingSection from "@/components/PricingSection";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <QuickValueStrip />
      <FeaturesSection />
      <AIAssistantSection />
      <HowItWorksSection />
      <BuiltForShopsSection />
      <BeforeAfterSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
