import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { locales } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { buildLocaleHref } from "@/i18n/localePath";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const { locale, t } = useI18n();
  const [currentPathname, setCurrentPathname] = useState(`/${locale}`);
  const [currentSearch, setCurrentSearch] = useState("");

  useEffect(() => {
    setCurrentPathname(window.location.pathname || `/${locale}`);
    setCurrentSearch(window.location.search ?? "");
  }, [locale]);

  const currentSearchParams = useMemo(() => new URLSearchParams(currentSearch), [currentSearch]);

  const navLinks = [
    { href: "#features", label: t("nav.links.features") },
    { href: "#live-demo", label: t("nav.links.liveDemo") },
    { href: "#how-it-works", label: t("nav.links.howItWorks") },
    { href: "#pricing", label: t("nav.links.pricing") },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link href={`/${locale}`} className="inline-flex items-center">
          <Image
            src="/logo.png"
            alt={t("meta.logoAlt")}
            width={1018}
            height={246}
            priority
            className="h-10 w-auto"
          />
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
                href={buildLocaleHref(currentPathname, code, currentSearchParams)}
                aria-label={`${t("nav.languageLabel")}: ${t(`nav.languages.${code}`)}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`nav.languages.${code}`)}
              </Link>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${locale}/account`}>{t("nav.account")}</Link>
          </Button>
          <Button variant="hero" size="sm" asChild>
            <Link href={`/${locale}/start?plan=starter`}>{t("nav.signUp")}</Link>
          </Button>
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
                    href={buildLocaleHref(currentPathname, code, currentSearchParams)}
                    onClick={() => setOpen(false)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      locale === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(`nav.languages.${code}`)}
                  </Link>
                ))}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/${locale}/account`} onClick={() => setOpen(false)}>
                  {t("nav.account")}
                </Link>
              </Button>
              <Button variant="hero" size="sm" asChild>
                <Link href={`/${locale}/start?plan=starter`} onClick={() => setOpen(false)}>
                  {t("nav.signUp")}
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
