export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="page-shell flex flex-col gap-2 py-6 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Chainify is an independent research prototype. Your data stays in your
          Solid Pod.
        </p>
        <p className="shrink-0">W3C Solid · Solid-OIDC · DPoP</p>
      </div>
    </footer>
  );
}
