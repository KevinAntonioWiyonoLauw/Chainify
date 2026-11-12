"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Compass,
  Database,
  Inbox,
  LayoutDashboard,
  Menu,
  Network,
  Send,
  ShieldCheck,
  Store,
  Tag,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { ChainifyLogo } from "@/components/chainify/chainify-logo";
import { SessionBadge } from "@/components/chainify/session-badge";
import { ThemeToggle } from "@/components/chainify/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profil usaha", icon: Store },
  { href: "/listings", label: "Listing", icon: Tag },
  { href: "/discover", label: "Discovery", icon: Compass },
  { href: "/evidence", label: "Bukti", icon: ShieldCheck },
  { href: "/rfq", label: "RFQ", icon: Send },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/pod", label: "Pod access", icon: Database },
] as const;

const SIDEBAR_TOKENS = {
  default: "--shell-sidebar-default",
  min: "--shell-sidebar-min",
  max: "--shell-sidebar-max",
} as const;
const SIDEBAR_FALLBACKS = { default: 216, min: 180, max: 360 } as const;
const subscribeToNothing = () => () => {};

let sidebarTokenCache: { key: string; value: typeof SIDEBAR_FALLBACKS } | null = null;

function readSidebarTokens(): typeof SIDEBAR_FALLBACKS {
  if (typeof window === "undefined") return SIDEBAR_FALLBACKS;
  const styles = getComputedStyle(document.documentElement);
  const key = Object.values(SIDEBAR_TOKENS)
    .map((token) => styles.getPropertyValue(token))
    .join("|");
  if (sidebarTokenCache?.key === key) return sidebarTokenCache.value;

  const value = Object.fromEntries(
    Object.entries(SIDEBAR_TOKENS).map(([key, token]) => [
      key,
      Number.parseFloat(styles.getPropertyValue(token)) || SIDEBAR_FALLBACKS[key as keyof typeof SIDEBAR_FALLBACKS],
    ]),
  ) as typeof SIDEBAR_FALLBACKS;
  sidebarTokenCache = { key, value };
  return value;
}

function useSidebarTokens(): typeof SIDEBAR_FALLBACKS {
  return useSyncExternalStore(subscribeToNothing, readSidebarTokens, () => SIDEBAR_FALLBACKS);
}
const RESIZE_STEP = 10;
const EASE_OUT = [0.25, 1, 0.5, 1] as const;
const PILL_SPRING = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.7,
} as const;

interface SidebarContentProps {
  pathname: string;
  onNavigate?: () => void;
  onClose?: () => void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
}

function SidebarContent({
  pathname,
  onNavigate,
  onClose,
  closeButtonRef,
}: SidebarContentProps) {
  const pillId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-header shrink-0 items-center gap-2.5 border-b border-border px-3">
        <Link
          href="/"
          aria-label="Chainify home"
          className="rounded-md text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onNavigate}
        >
          <ChainifyLogo compact />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href="/"
            className="w-fit rounded-sm text-sm leading-none font-medium tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onNavigate}
          >
            Chainify
          </Link>
          <span className="truncate text-micro leading-none text-muted-foreground">
            Business trust network
          </span>
        </div>
        {onClose && (
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon-sm"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>

      <nav
        aria-label="Workspace navigation"
        className="obsidian-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3"
      >
        <span className="block px-2 py-1 text-micro leading-none font-medium tracking-[1px] text-muted-foreground uppercase">
          Workspace
        </span>
        <ul className="mt-2 flex flex-col gap-px">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex h-8 w-full items-center gap-2 rounded-control px-2 text-body leading-none font-medium outline-none select-none",
                    "transition-[color,scale] duration-150 hover:text-foreground active:scale-[0.98] active:duration-75 focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={pillId}
                      aria-hidden
                      className="absolute inset-0 rounded-control bg-muted shadow-control"
                      transition={
                        reduceMotion ? { duration: 0 } : PILL_SPRING
                      }
                    />
                  )}
                  <item.icon
                    aria-hidden
                    className="relative size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                  <span className="relative min-w-0 flex-1 truncate">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <a
          href="https://www.w3.org/TR/solid-protocol/"
          target="_blank"
          rel="noreferrer"
          className="group flex h-8 items-center gap-2 rounded-control px-2 text-body font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="flex-1">Solid protocol</span>
          <ArrowUpRight
            aria-hidden
            className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100"
          />
        </a>
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <div className="flex items-center gap-2.5">
          <span className="icon-plate text-muted-foreground">
            <Network aria-hidden className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs leading-4 font-medium">Pod-first by design</p>
            <p className="mt-0.5 truncate text-micro leading-4 text-muted-foreground">
              Your data stays with you
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function trapDrawerFocus(
  event: KeyboardEvent<HTMLDivElement>,
  drawer: HTMLElement | null,
) {
  if (event.key !== "Tab" || !drawer) return;
  const focusable = Array.from(
    drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const drawerId = useId();
  const sidebarId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const drag = useRef<{
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const limits = useSidebarTokens();
  const [committedWidth, setCommittedWidth] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const currentPage =
    NAV_ITEMS.find(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    ) ?? NAV_ITEMS[0];
  const width = Math.min(
    limits.max,
    Math.max(limits.min, Math.round(dragWidth ?? committedWidth ?? limits.default)),
  );

  const closeDrawer = useCallback(() => {
    restoreFocus.current = true;
    setDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (drawerOpen) {
      closeButtonRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = () => {
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", closeAtDesktop);
    return () => media.removeEventListener("change", closeAtDesktop);
  }, [drawerOpen]);

  const clampWidth = (next: number) =>
    Math.min(limits.max, Math.max(limits.min, Math.round(next)));
  const commitWidth = (next: number) => setCommittedWidth(clampWidth(next));

  const onResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, width };
    setDragWidth(width);
  };

  const onResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.width = clampWidth(
      drag.current.startWidth + event.clientX - drag.current.startX,
    );
    setDragWidth(drag.current.width);
  };

  const onResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const finalWidth = drag.current.width;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragWidth(null);
    commitWidth(finalWidth);
  };

  const onResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: width - RESIZE_STEP,
      ArrowRight: width + RESIZE_STEP,
      Home: limits.min,
      End: limits.max,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    commitWidth(targets[event.key]);
  };

  return (
    <div
      data-resizing={dragWidth !== null ? "" : undefined}
      className="obsidian-shell relative flex h-dvh min-h-0 w-full overflow-hidden bg-background text-foreground"
      style={{ "--sidebar-width": `${width}px` } as CSSProperties}
    >
      <a
        href="#workspace-content"
        className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-(--primary-shadow) transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside
        id={sidebarId}
        className="relative hidden w-(--sidebar-width) shrink-0 flex-col border-r border-border bg-sidebar lg:flex"
      >
        <SidebarContent pathname={pathname} />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-controls={sidebarId}
          aria-valuemin={limits.min}
          aria-valuemax={limits.max}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={() => commitWidth(limits.default)}
          onKeyDown={onResizeKey}
          className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none select-none"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 group-hover:bg-(--border-strong) group-focus-visible:w-0.5 group-focus-visible:bg-ring group-active:bg-ring"
          />
        </div>
      </aside>

      <section
        aria-label={currentPage.label}
        inert={drawerOpen ? true : undefined}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <header className="flex h-header shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-page sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              ref={menuButtonRef}
              variant="outline"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls={drawerOpen ? drawerId : undefined}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <span className="truncate text-base leading-none font-medium tracking-normal">
              {currentPage.label}
            </span>
            <Badge
              variant="outline"
              className="hidden gap-1.5 font-normal sm:inline-flex"
            >
              <span aria-hidden className="status-dot bg-primary" />
              Pod-native
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <SessionBadge />
            <span aria-hidden className="mx-1 h-4 w-px bg-border max-[22rem]:hidden" />
            <ThemeToggle />
          </div>
        </header>

        <main
          id="workspace-content"
          tabIndex={-1}
          className="obsidian-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
        >
          <div className="mx-auto w-full max-w-shell px-page py-stack sm:py-8">
            {children}
          </div>
        </main>
      </section>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            className="absolute inset-0 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
          >
            <div
              aria-hidden
              className="absolute inset-0 bg-(--overlay-scrim)"
              onClick={closeDrawer}
            />
            <motion.div
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label="Workspace navigation"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeDrawer();
                } else {
                  trapDrawerFocus(event, drawerRef.current);
                }
              }}
              className="absolute inset-y-0 left-0 flex w-drawer max-w-[85%] flex-col border-r border-border bg-sidebar shadow-(--overlay-shadow)"
              initial={{ x: reduceMotion ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduceMotion ? 0 : "-100%" }}
              transition={{
                duration: reduceMotion ? 0 : 0.28,
                ease: EASE_OUT,
              }}
            >
              <SidebarContent
                pathname={pathname}
                onNavigate={closeDrawer}
                onClose={closeDrawer}
                closeButtonRef={closeButtonRef}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
