import { EvidenceDetail } from "./evidence-detail";

/**
 * Route shell for one evidence document.
 *
 * Evidence ids live in the owner's Pod, so nothing is prerenderable: the id is handed to
 * a client component that reads the document from the live Pod.
 *
 * `instant = false` because the shared `AppShell` reads `usePathname()` inside a client
 * component; Next will not prerender this segment otherwise. The page genuinely cannot
 * render before the Pod answers, so it blocks rather than shipping an empty shell.
 */
export const instant = false;

export default async function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EvidenceDetail id={id} />;
}
