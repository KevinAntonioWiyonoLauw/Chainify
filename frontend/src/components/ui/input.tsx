import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-control border border-transparent bg-(--control) px-2.5 py-1 text-body shadow-control transition-[background-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-foreground placeholder:text-(--text-subtle) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/40 dark:aria-invalid:ring-destructive/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
