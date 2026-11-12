"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info, BookOpen, PenLine } from "lucide-react";
import { ProtectedNotice } from "@/components/chainify/protected-notice";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSolidSession } from "@/lib/solid/use-solid-session";
import { readResource, writeResource } from "@/lib/solid/session";
import { resolveIdentity } from "@/lib/chainify/api";

const DEFAULT_BODY = `<> a <https://schema.org/Note> ;
  <https://schema.org/text> "Chainify Phase 1 Pod connectivity test." .
`;

export default function PodPage() {
  const session = useSolidSession();
  const [resourceUrl, setResourceUrl] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [readOutput, setReadOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState<"write" | "read" | null>(null);
  const [storageHint, setStorageHint] = useState<string | null>(null);

  // Pre-fill the test path from the WebID's declared storage, when available.
  useEffect(() => {
    if (!session.webId) return;
    const controller = new AbortController();
    resolveIdentity(session.webId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || result.storage.length === 0) return;
        const base = result.storage[0].replace(/\/?$/, "/");
        setStorageHint(base);
        setResourceUrl((current) =>
          current.length > 0 ? current : `${base}chainify/test.ttl`,
        );
      })
      .catch(() => {
        // The field stays editable; the dashboard surfaces resolver errors.
      });
    return () => controller.abort();
  }, [session.webId]);

  const isValidTarget = (() => {
    try {
      const url = new URL(resourceUrl);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  })();

  const onWrite = async () => {
    setBusy("write");
    try {
      await writeResource(resourceUrl, body, "text/turtle");
      toast.success("Resource written to your Pod.", {
        description: resourceUrl,
      });
    } catch (cause) {
      toast.error("Write failed.", {
        description:
          cause instanceof Error ? cause.message : "Unknown Pod error.",
      });
    } finally {
      setBusy(null);
    }
  };

  const onRead = async () => {
    setBusy("read");
    try {
      const text = await readResource(resourceUrl);
      setReadOutput(text);
      toast.success("Resource read from your Pod.");
    } catch (cause) {
      setReadOutput(null);
      toast.error("Read failed.", {
        description:
          cause instanceof Error ? cause.message : "Unknown Pod error.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="page-header">
        <div>
          <h1>Pod access</h1>
          <p className="page-lead mt-1.5">
            A minimal read/write check against your own Solid Pod, using your
            authenticated session directly from the browser.
          </p>
        </div>
      </div>

      {session.status === "loading" && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {session.status === "anonymous" && (
        <ProtectedNotice
          reason={session.webId ? "session-missing" : "session-required"}
        />
      )}

      {session.status === "authenticated" && (
        <>
          <Alert>
            <Info aria-hidden />
            <AlertTitle>What this proves — and what it does not</AlertTitle>
            <AlertDescription>
              A successful write and read show that your WebID session can
              access this resource under your Pod&apos;s access policy. It does
              not prove that other Pods are reachable, that access control is
              configured correctly for other resources, or that any business
              claim is true. Revoking access later cannot erase copies already
              downloaded elsewhere.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Test resource</CardTitle>
              <CardDescription>
                {storageHint
                  ? `Defaulting to your declared storage: ${storageHint}`
                  : "Enter the full URL of a Turtle resource in your Pod."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="resource-url">Resource URL</Label>
                <Input
                  id="resource-url"
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="http://localhost:3001/your-pod/chainify/test.ttl"
                  value={resourceUrl}
                  onChange={(event) => setResourceUrl(event.target.value)}
                  aria-describedby="resource-help"
                />
                <p id="resource-help" className="text-caption text-muted-foreground">
                  Phase 1 writes a small text/turtle resource only. Nothing is
                  sent to the Chainify node; requests go straight to your Pod.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="resource-body">Turtle body</Label>
                <Textarea
                  id="resource-body"
                  className="min-h-32 font-mono text-mono-caption"
                  spellCheck={false}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </div>

              <div className="action-rail">
                <Button
                  onClick={() => void onWrite()}
                  disabled={!isValidTarget || busy !== null}
                >
                  <PenLine aria-hidden />
                  {busy === "write" ? "Writing…" : "Write resource"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void onRead()}
                  disabled={!isValidTarget || busy !== null}
                >
                  <BookOpen aria-hidden />
                  {busy === "read" ? "Reading…" : "Read resource"}
                </Button>
              </div>

              <div aria-live="polite">
                {readOutput !== null && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="read-output">Last read result</Label>
                    <Textarea
                      id="read-output"
                      className="min-h-32 font-mono text-mono-caption"
                      readOnly
                      value={readOutput}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
