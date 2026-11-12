import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ProtectedNoticeProps {
  /**
   * Why the page cannot write. A direct visit to /profile while signed in is an
   * interruption of an already valid session, not a signed-out state, so the copy and
   * the action differ.
   */
  reason?: "session-required" | "session-missing";
}

export function ProtectedNotice({ reason = "session-required" }: ProtectedNoticeProps) {
  const interrupted = reason === "session-missing";

  return (
    <Alert>
      <ShieldAlert aria-hidden />
      <AlertTitle>
        {interrupted
          ? "Sesi Solid tidak ditemukan di tab ini"
          : "Pod access requires Solid-OIDC sign-in"}
      </AlertTitle>
      <AlertDescription>
        {interrupted ? (
          <p>
            Halaman ini membaca dan menulis ke Pod Anda sendiri, jadi sesi DPoP harus
            ada lebih dulu. Sesi hanya disimpan di tab ini dan tidak diteruskan ke mana
            pun.{" "}
            <Link href="/login">Masuk lagi dengan provider Solid</Link> lalu kembali ke
            halaman ini.
          </p>
        ) : (
          <p>
            This page reads and writes resources in your own Solid Pod. Chainify
            uses your WebID and a DPoP-bound session to prove who you are; it does
            not bypass your Pod&apos;s access control.{" "}
            <Link href="/login">Sign in with your Solid identity provider</Link>{" "}
            to continue.
          </p>
        )}
        <Button
          className="mt-3"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          {interrupted ? "Masuk lagi" : "Sign in"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
