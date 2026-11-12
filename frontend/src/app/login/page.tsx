import type { Metadata } from "next";
import { ProviderPicker } from "@/components/chainify/provider-picker";
import { SiteHeader } from "@/components/chainify/site-header";
import { SiteFooter } from "@/components/chainify/site-footer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in — Chainify",
  description:
    "Sign in to Chainify with a Solid-OIDC provider. Authentication is not authorization, and verification is not real-world truth.",
};

const GUARANTEES = [
  {
    title: "Authentication ≠ authorization ≠ consent",
    body: "Signing in proves which WebID is acting. Your Pod separately decides whether that identity may access a given resource. Consent is your explicit, purpose-bound choice to share — none of the three implies the others.",
  },
  {
    title: "Verification ≠ real-world truth",
    body: "A valid credential structure, a recognized issuer, and a sound proof do not prove a transaction actually happened, that an issuer is honest, or that a partner will deliver. Trust decisions remain yours.",
  },
  {
    title: "Revocation has limits",
    body: "Revoking access can block future reads where the provider supports it, but it cannot erase copies a recipient has already downloaded. Share deliberately, with a stated purpose.",
  },
] as const;

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="page-shell page-band flex flex-1 flex-col items-center">
        <div className="w-full max-w-form">
          <div className="mb-5">
            <h1>Sign in to Chainify</h1>
            <p className="mt-2 text-body text-muted-foreground">
            Use the identity provider you already trust. Chainify is a client
              of your Pod, not its owner.
            </p>
          </div>
          <ProviderPicker />
        </div>

        <div className="grid-cards mt-8 w-full max-w-marketing">
          {GUARANTEES.map((item) => (
            <Card key={item.title} size="sm">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body text-muted-foreground">
                  {item.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
