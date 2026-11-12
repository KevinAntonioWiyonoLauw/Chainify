"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import SideRays from "@/components/block/side-rays";

const emptySubscribe = () => () => {};

/** Shader colours follow the semantic theme tokens rather than TS literals. */
export function HeroRays() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [rays, setRays] = useState({ primary: "#d8a25b", secondary: "#8eafd0", opacity: 0.42 });
  const isDark = mounted && resolvedTheme === "dark";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const styles = getComputedStyle(container);
    const next = {
      primary: styles.getPropertyValue("--rays-primary").trim() || "#d8a25b",
      secondary: styles.getPropertyValue("--rays-secondary").trim() || "#8eafd0",
      opacity: Number(styles.getPropertyValue("--rays-opacity")) || 0.42,
    };
    setRays((current) =>
      current.primary === next.primary &&
      current.secondary === next.secondary &&
      current.opacity === next.opacity
        ? current
        : next,
    );
  }, [resolvedTheme]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -inset-x-page overflow-hidden sm:inset-x-0"
    >
      <SideRays
        className="absolute inset-0"
        rayColor1={rays.primary}
        rayColor2={rays.secondary}
        origin="top-right"
        speed={2.5}
        intensity={2}
        spread={2}
        density={5}
        followMouse
        lightMode={!isDark}
        opacity={rays.opacity}
        falloff={1.8}
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,var(--background)_18%,transparent_62%)]" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
