import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full min-w-0 rounded-control border border-transparent bg-(--control) px-2.5 py-2 text-body shadow-control transition-[background-color,box-shadow] duration-150 outline-none placeholder:text-(--text-subtle) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 dark:aria-invalid:ring-destructive/50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
