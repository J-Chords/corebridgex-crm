import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** "Style E — Contained" icon system from the reference: every icon lives in a rounded-square tile. */
const containedIconVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md border transition-colors [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "size-7 [&_svg]:size-3.5",
        md: "size-8 [&_svg]:size-4",
        lg: "size-9.5 [&_svg]:size-4.5",
        xl: "size-11 [&_svg]:size-5",
      },
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        active: "border-primary/20 bg-primary/10 text-primary",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "neutral",
    },
  }
);

export interface ContainedIconProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof containedIconVariants> {}

export function ContainedIcon({
  className,
  size,
  tone,
  ...props
}: ContainedIconProps) {
  return (
    <div
      className={cn(containedIconVariants({ size, tone }), className)}
      {...props}
    />
  );
}
