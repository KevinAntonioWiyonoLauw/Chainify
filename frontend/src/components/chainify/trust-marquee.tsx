"use client";

import { DraggableMarquee } from "@/components/block/draggable-marquee";

const PILLARS = [
  { id: "trust", src: "Portable business trust" },
  { id: "network", src: "Private supply network" },
  { id: "capacity", src: "Collaborative capacity" },
];

/**
 * Text chips ride the marquee's `src` field; `renderItem` replaces the default
 * Image renderer, so no image assets are required.
 */
export function TrustMarquee() {
  return (
    <DraggableMarquee
      items={PILLARS}
      repeatCount={4}
      speed={0.5}
      gapClassName="gap-4"
      itemClassName="rounded-full"
      pauseOnHover
      label="Chainify pillars. Drag or use the left and right arrow keys."
      renderItem={(item: { src: string }) => (
        <span className="chip">
          <span className="status-dot bg-foreground/45" aria-hidden />
          {item.src}
        </span>
      )}
    />
  );
}
