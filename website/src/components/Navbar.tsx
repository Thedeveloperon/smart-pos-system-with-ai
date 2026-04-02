import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { locale, t } = useI18n();

  const navLinks = [
    { href: "#features", label: t("nav.links.features") },
    { href: "#how-it-works", label: t("nav.links.howItWorks") },
    { href: "#pricing", label: t("nav.links.pricing") },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link href={`/${locale}`} className="inline-flex items-center">
          <Image src="/logo.png" alt={t("meta.logoAlt")} width={180} height={43} priority />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}${item.href}`}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <div className="flex items-center rounded-full border border-border p-1">
            {locales.map((code) => (
              <Link
                key={code}
                href={`/${code}`}
                aria-label={`${t("nav.languageLabel")}: ${t(`nav.languages.${code}`)}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`nav.languages.${code}`)}
              </Link>
            ))}
          </div>
          <Button variant="hero" size="sm">{t("nav.cta")}</Button>
        </div>

        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-background border-b border-border overflow-hidden"
          >
            <div className="flex flex-col gap-4 p-4">
              {navLinks.map((item) => (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}`}
                  className="text-muted-foreground hover:text-foreground text-sm"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex items-center gap-2">
                {locales.map((code) => (
                  <Link
                    key={code}
                    href={`/${code}`}
                    onClick={() => setOpen(false)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(`nav.languages.${code}`)}
                  </Link>
                ))}
              </div>
              <Button variant="hero" size="sm">{t("nav.cta")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
