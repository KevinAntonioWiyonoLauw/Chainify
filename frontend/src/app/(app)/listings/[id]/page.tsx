import { ListingDetail } from "./listing-detail";

/**
 * Route shell for one listing.
 *
 * The set of ids is whatever the owner happens to have in their Pod, so nothing here is
 * prerenderable: the server hands the id to a client component that reads the document
 * from the live Pod.
 *
 * `instant = false` is required, not a shortcut. The shared `AppShell` reads
 * `usePathname()` in a client component, so with Cache Components enabled Next refuses
 * to prerender this segment and demands either a Suspense boundary or an opted-out
 * route. A Suspense boundary would only hide the fact that the page cannot know its own
 * content before the Pod answers, so the route declares itself blocking instead of
 * pretending otherwise.
 */
export const instant = false;

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ListingDetail id={id} />;
}
