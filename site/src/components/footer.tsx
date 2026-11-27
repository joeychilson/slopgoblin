import { site } from "@/lib/site";

const links = [
  { label: "Source", href: site.repo },
  { label: "Privacy policy", href: `${site.repo}/blob/main/PRIVACY.md` },
  { label: "License", href: `${site.repo}/blob/main/LICENSE` },
];

export function Footer() {
  return (
    <footer className="column footer">
      <div className="footer-row">
        <p>
          Made by{" "}
          <a href={site.author.href} className="text-link">
            {site.author.name}
          </a>
        </p>
        <nav aria-label="Project" className="footer-nav">
          {links.map((item) => (
            <a key={item.href} href={item.href} className="plain-link">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="footer-note">Not made by, or connected to, X or Google.</p>
    </footer>
  );
}
