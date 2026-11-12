import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border border-transparent leading-none font-medium whitespace-nowrap outline-none select-none transition-[background-color,color,box-shadow,scale] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:duration-75 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-(--primary-shadow) hover:bg-(--primary-hover)",
        outline:
          "border-transparent bg-(--control) text-foreground shadow-(--control-shadow) hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-(--control-shadow) hover:bg-(--muted-hover) aria-expanded:bg-secondary",
        ghost:
          "text-muted-foreground shadow-none hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-(--destructive-solid) text-white shadow-[0_1px_2px_rgb(0_0_0/0.16),inset_0_1px_0_rgb(255_255_255/0.16),0_0_0_1px_rgb(0_0_0/0.08)] hover:bg-(--destructive-solid-hover) focus-visible:ring-destructive/50",
        link: "h-auto rounded-sm px-0 text-primary underline-offset-4 shadow-none hover:underline active:scale-100",
      },
      size: {
        default:
          "h-control-md px-2.5 text-body has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-control-xs gap-1 px-2 text-caption has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-sm gap-1.5 px-[9px] text-caption has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-control-lg px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        icon: "size-control-md",
        "icon-xs": "size-control-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm",
        "icon-lg": "size-control-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
