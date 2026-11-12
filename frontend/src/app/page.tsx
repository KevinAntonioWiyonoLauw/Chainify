import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Handshake,
  Layers,
  Network,
  ShieldCheck,
} from "lucide-react";
import { DiscoverButton } from "@/components/block/discover-button";
import { FlipText } from "@/components/block/flip-text";
import { HeroRays } from "@/components/chainify/hero-rays";
import { SiteHeader } from "@/components/chainify/site-header";
import { SiteFooter } from "@/components/chainify/site-footer";
import { TrustMarquee } from "@/components/chainify/trust-marquee";
import { VocabularyStream } from "@/components/chainify/vocabulary-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PILLAR_CARDS = [
  {
    icon: BadgeCheck,
    title: "Portable business trust",
    body: "Transaction evidence, fulfillment records, and business credentials live in your own Pod. Share a specific proof for a specific purpose, and carry your reputation across compatible applications instead of rebuilding it on each platform.",
  },
  {
    icon: ShieldCheck,
    title: "Private supply network",
    body: "Publish only the offer attributes you choose: materials, requirements, or capacity. Customer lists, margins, and full transaction history stay private by default. Open data formats keep the door open to other tools.",
  },
  {
    icon: Handshake,
    title: "Collaborative capacity",
    body: "Match raw-material needs, production by-products, and spare manufacturing capacity across businesses. Move from inquiry to RFQ to agreement, with evidence recorded in the Pods of the parties involved.",
  },
] as const;

const STEPS = [
  {
    title: "Connect your Pod",
    body: "Sign in with Solid-OIDC and a WebID. Your Pod stays the authoritative store for your business data.",
  },
  {
    title: "Publish selected offers",
    body: "Write offers or requirements to your own Pod and mark exactly which attributes are discoverable.",
  },
  {
    title: "Discover across federated Pods",
    body: "Chainify nodes resolve and query participating Pods, returning matches with source and freshness metadata.",
  },
  {
    title: "Exchange evidence and RFQ",
    body: "Request owner-authorized evidence, verify its issuer and proof, then negotiate and record agreements.",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative isolate flex min-h-(--hero-min-height) items-center overflow-hidden">
          <HeroRays />
          <div className="page-shell page-band relative z-10 flex flex-col items-start gap-stack">
            <Badge variant="secondary" className="h-control-xs px-2.5 tracking-[0.12em] uppercase">
              W3C Solid · Federated
            </Badge>
            <h1 className="max-w-3xl text-display">
              <FlipText duration={3.2}>Own your proof</FlipText>
              <span className="mt-4 block max-w-2xl text-subhead text-muted-foreground">
                A business trust network for Indonesian MSMEs.
              </span>
            </h1>
            <p className="max-w-xl text-body-lg text-muted-foreground">
              Chainify helps small manufacturers and suppliers publish selected
              offers, find partners across organizations, and exchange verifiable
              evidence — without handing the whole business to one platform.
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <DiscoverButton label="Open the dashboard" href="/dashboard" />
              <Button
                variant="outline"
                size="lg"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Sign in with Solid
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="Chainify pillars" className="border-y border-border bg-background py-6">
          <TrustMarquee />
        </section>

        <section id="product" className="page-shell page-band scroll-mt-20">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow mb-3">The problem, answered</p>
            <h2>Reputation is fragmented. Your data should not have to be.</h2>
            <p className="mt-4 text-body-lg text-muted-foreground">
              Payment history and fulfillment proof are scattered across
              invoices, chats, and spreadsheets. Central platforms ask for
              everything in exchange for visibility. Chainify takes the
              federated route instead.
            </p>
          </div>
          <div className="grid-cards">
            {PILLAR_CARDS.map((pillar) => (
              <Card key={pillar.title} className="h-full">
                <CardHeader>
                  <span className="icon-plate">
                    <pillar.icon className="size-4" strokeWidth={1.75} aria-hidden />
                  </span>
                  <CardTitle className="mt-3">{pillar.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{pillar.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-t border-border bg-muted/30">
          <div className="page-shell page-band">
            <div className="mb-8 max-w-2xl">
              <p className="eyebrow mb-3">How it works</p>
              <h2>Four steps, no central database of your business.</h2>
            </div>
            <ol className="grid-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <span className="font-mono text-mono-caption text-muted-foreground tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <CardTitle className="mt-2">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription>{step.body}</CardDescription>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="trust" className="scroll-mt-20 border-t border-border">
          <div className="page-shell page-band">
            <div className="grid items-center gap-stack lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow mb-3">Architecture, honestly</p>
                <h2>No central catalog. No copy of your private data.</h2>
                <p className="mt-4 text-body-lg text-muted-foreground">
                  Each Chainify node is a stateless resolver. The authoritative
                  record stays in the owner&apos;s Pod; access decisions stay
                  with the Pod&apos;s own policy. For this prototype, one
                  operator runs the node — a documented trade-off, not a claim
                  of full decentralization.
                </p>
              </div>
              <div className="surface-quiet">
                <div className="flex flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center">
                  <div className="flex-1 rounded-control border border-border bg-background px-4 py-5">
                    <Layers className="mx-auto mb-2 size-4 text-foreground" strokeWidth={1.75} aria-hidden />
                    <p className="text-body font-medium">Your Pod</p>
                    <p className="mt-1 text-caption text-muted-foreground">authoritative</p>
                  </div>
                  <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
                  <div className="flex-1 rounded-control border border-border-strong bg-muted px-4 py-5">
                    <Network className="mx-auto mb-2 size-4 text-foreground" strokeWidth={1.75} aria-hidden />
                    <p className="text-body font-medium">Chainify node</p>
                    <p className="mt-1 text-caption text-muted-foreground">stateless resolver</p>
                  </div>
                  <ArrowRight className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
                  <div className="flex-1 rounded-control border border-border bg-background px-4 py-5">
                    <Layers className="mx-auto mb-2 size-4 text-foreground" strokeWidth={1.75} aria-hidden />
                    <p className="text-body font-medium">Partner Pods</p>
                    <p className="mt-1 text-caption text-muted-foreground">owner-authorized</p>
                  </div>
                </div>
                <p className="mt-4 text-center text-caption text-muted-foreground">
                  Verification proves structure and signatures — never, by
                  itself, real-world truth.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Product vocabulary" className="border-t border-border bg-muted/30">
          <VocabularyStream />
        </section>

        <section className="border-t border-border">
          <div className="page-shell page-band flex flex-col items-start gap-stack">
            <h2 className="max-w-2xl">Start with your own Pod. Keep what is yours.</h2>
            <p className="max-w-xl text-body-lg text-muted-foreground">
              Connect a local Community Solid Server, resolve your WebID, and
              write your first test resource — all without giving Chainify a
              central copy of your records.
            </p>
            <DiscoverButton label="Open the dashboard" href="/dashboard" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
