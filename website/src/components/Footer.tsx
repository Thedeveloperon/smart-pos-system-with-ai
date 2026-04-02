const Footer = () => (
  <footer className="bg-background border-t border-border py-12">
    <div className="container mx-auto px-4">
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <span className="text-foreground font-heading text-xl font-bold">
            Smart<span className="text-primary">POS</span>
          </span>
          <p className="text-muted-foreground text-sm mt-3 leading-relaxed">
            A smart, easy-to-use POS system for small shops.
          </p>
        </div>
        {[
          { title: "Product", links: ["Features", "Pricing", "Integrations"] },
          { title: "Company", links: ["About", "Blog", "Careers"] },
          { title: "Support", links: ["Help Center", "Contact", "Privacy Policy"] },
        ].map((col) => (
          <div key={col.title}>
            <h4 className="text-foreground font-semibold text-sm mb-3">{col.title}</h4>
            <ul className="space-y-2">
              {col.links.map((link) => (
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
        <p className="text-muted-foreground/60 text-sm">© 2026 SmartPOS. All rights reserved.</p>
      </div>
    </div>
  </footer>
);

export default Footer;
