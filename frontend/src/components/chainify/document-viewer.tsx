"use client";

/**
 * Raw JSON-LD viewer for one Pod document.
 *
 * Chainify's claim is that a listing is a document, not a row in someone's database.
 * A buyer who wants to check that claim should be able to read the bytes, so this
 * component shows exactly what the Pod returned: no re-serialisation, no dropped
 * fields, no prettifying that could hide a malformed body.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, FileJson, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PodError, readDocument } from "@/lib/solid/resources";

type LoadState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; raw: string; pretty: string | null }
  | { status: "error"; message: string };

function toPretty(raw: string): { pretty: string | null; bytes: number } {
  const bytes = new TextEncoder().encode(raw).length;
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), bytes };
  } catch {
    // Invalid JSON is still shown verbatim: hiding it would hide the bug.
    return { pretty: null, bytes };
  }
}

export function DocumentViewer({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description?: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    readDocument(url)
      .then((raw) => {
        if (cancelled) return;
        if (raw === null) {
          setState({ status: "missing" });
          return;
        }
        const { pretty } = toPretty(raw);
        setState({ status: "ready", raw, pretty });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            cause instanceof PodError
              ? cause.message
              : cause instanceof Error
                ? cause.message
                : "Dokumen tidak dapat dibaca.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setNonce((value) => value + 1);
  }, []);

  const onCopy = async () => {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission is the browser's call; the text is still selectable.
      setCopied(false);
    }
  };

  const sizeLabel =
    state.status === "ready" ? `${toPretty(state.raw).bytes} byte` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson aria-hidden className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>
          {description ??
            "Isi persis seperti yang dikembalikan Pod Anda pada permintaan ini."}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            {sizeLabel && (
              <Badge variant="outline" className="font-normal">
                {sizeLabel}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Muat ulang dokumen"
              onClick={reload}
              disabled={state.status === "loading"}
            >
              <RefreshCw aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onCopy()}
              disabled={state.status !== "ready"}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Tersalin" : "Salin"}
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-mono text-micro break-all text-muted-foreground">{url}</p>

        {state.status === "loading" && (
          <Skeleton className="h-40 w-full rounded-control" />
        )}

        {state.status === "missing" && (
          <p className="text-body text-muted-foreground">
            Pod menjawab 404 untuk alamat ini. Dokumennya sudah tidak ada — mungkin
            dihapus, atau URL-nya memang tidak pernah menunjuk ke sini.
          </p>
        )}

        {state.status === "error" && (
          <p className="text-body text-destructive">{state.message}</p>
        )}

        {state.status === "ready" && (
          <>
            {state.pretty === null && (
              <p className="text-caption text-destructive">
                Body ini bukan JSON yang valid. Ditampilkan apa adanya, tanpa
                diperbaiki.
              </p>
            )}
            <pre className="max-h-[28rem] overflow-auto rounded-control border border-border bg-muted p-3 font-mono text-micro leading-relaxed">
              <code>{state.pretty ?? state.raw}</code>
            </pre>
          </>
        )}
      </CardContent>
    </Card>
  );
}
