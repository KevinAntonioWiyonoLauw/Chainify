import { cn } from "@/lib/utils";

interface ChainifyLogoProps {
  className?: string;
  compact?: boolean;
}

export function ChainifyLogo({ className, compact = false }: ChainifyLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        fill="none"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path
          d="m9 11 7-4 7 4v8l-7 4-7-4v-8Z"
          stroke="var(--background)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m9 11 7 4 7-4m-7 4v8m-4-14 7 4"
          stroke="var(--background)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m16 15 4-2.3M16 19l-4-2.3"
          stroke="var(--background)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity=".55"
        />
      </svg>
      {!compact && (
        <span className="text-[15px] leading-none font-semibold tracking-[-0.025em]">
          Chainify
        </span>
      )}
    </span>
  );
}
