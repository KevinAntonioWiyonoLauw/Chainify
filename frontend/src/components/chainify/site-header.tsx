import Link from "next/link";
import { ChainifyLogo } from "@/components/chainify/chainify-logo";
import { ThemeToggle } from "@/components/chainify/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#trust", label: "Trust" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="page-shell flex h-header items-center justify-between gap-3 sm:gap-6">
        <Link
          href="/"
          aria-label="Chainify home"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ChainifyLogo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 sm:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-ring px-2.5 py-1.5 text-body font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <Button size="sm" variant="default">
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
