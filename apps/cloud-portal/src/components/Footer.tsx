import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

type FooterColumn = {
  title: string;
  links: string[];
};

const Footer = () => {
  const { locale, t, get } = useI18n();
  const columnsValue = get<FooterColumn[]>("footer.columns");
  const columns = Array.isArray(columnsValue) ? columnsValue : [];

  return (
    <footer className="bg-background border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Link href={`/${locale}`} className="inline-flex items-center">
              <Image
                src="/logo.png"
                alt={t("meta.logoAlt")}
                width={1018}
                height={246}
                className="h-10 w-auto"
              />
            </Link>
            <p className="text-muted-foreground text-sm mt-3 leading-relaxed">{t("footer.description")}</p>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="text-foreground font-semibold text-sm mb-3">{column.title}</h4>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-muted-foreground text-sm hover:text-foreground transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border mt-10 pt-6 text-center">
          <p className="text-muted-foreground/60 text-sm">{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
