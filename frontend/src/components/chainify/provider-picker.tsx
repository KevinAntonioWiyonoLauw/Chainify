"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Info, KeyRound } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { chainifyConfig } from "@/lib/chainify/config";
import { login } from "@/lib/solid/session";

export function ProviderPicker() {
  const [issuer, setIssuer] = useState(chainifyConfig.solidIssuer);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const startLogin = async (target: string) => {
    setError(null);
    let normalized: URL;
    try {
      normalized = new URL(target);
      if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
        throw new Error("Unsupported protocol.");
      }
    } catch {
      setError("Enter a valid http(s) issuer URL, for example http://localhost:13002/.");
      return;
    }
    setPending(true);
    try {
      await login(normalized.toString());
      // The browser navigates away to the identity provider here.
    } catch (cause) {
      setPending(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "The sign-in flow could not be started.",
      );
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void startLogin(issuer);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          Connect your Solid identity
        </CardTitle>
        <CardDescription>
          Sign in through a Solid-OIDC provider. Authentication happens between
          your browser and the provider; Chainify never sees your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <Info aria-hidden />
          <AlertTitle>What signing in does — and does not do</AlertTitle>
          <AlertDescription>
            Signing in proves who you are. It does not grant Chainify access to
            your Pod. Your Pod&apos;s own access policy decides what can be read
            or written, resource by resource.
          </AlertDescription>
        </Alert>

        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() => void startLogin(chainifyConfig.solidIssuer)}
        >
          {pending ? "Redirecting…" : "Continue with local CSS provider"}
        </Button>
        <p className="-mt-2 break-all text-center font-mono text-mono-micro text-muted-foreground">
          {chainifyConfig.solidIssuer}
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
          <Label htmlFor="issuer">Or use another Solid-OIDC issuer</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="issuer"
              name="issuer"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="https://pod-provider.example/"
              value={issuer}
              onChange={(event) => setIssuer(event.target.value)}
              required
              aria-describedby="issuer-help"
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Redirecting…" : "Sign in"}
            </Button>
          </div>
          <p id="issuer-help" className="text-caption text-muted-foreground">
            You will be redirected to the issuer and back to this app after
            consent.
          </p>
        </form>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Sign-in could not start</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
