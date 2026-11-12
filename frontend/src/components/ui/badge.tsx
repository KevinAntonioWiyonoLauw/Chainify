import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "group/badge inline-flex h-badge w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-control border border-transparent px-1.5 text-micro leading-none font-medium whitespace-nowrap transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-invalid:ring-destructive/30 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-(--primary-hover)",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-(--muted-hover)",
        destructive:
          "bg-destructive/10 text-destructive [a]:hover:bg-destructive/15",
        outline:
          "border-border-strong bg-muted text-foreground [a]:hover:bg-(--muted-hover)",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "h-auto rounded-sm px-0 text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
