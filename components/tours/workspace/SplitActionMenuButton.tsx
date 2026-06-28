"use client";

import { Slot } from "@radix-ui/react-slot";
import { EllipsisVertical } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type SplitActionMenuButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  menuAriaLabel: string;
  menuContent: ReactNode;
  menuDisabled?: boolean;
  menuAlign?: "start" | "center" | "end";
  menuSide?: "top" | "bottom";
  menuContentClassName?: string;
  triggerClassName?: string;
};

export const SplitActionMenuButton = forwardRef<
  HTMLButtonElement,
  SplitActionMenuButtonProps
>(function SplitActionMenuButton(
  {
    asChild = false,
    children,
    className,
    menuAriaLabel,
    menuContent,
    menuDisabled = false,
    menuAlign = "end",
    menuSide = "bottom",
    menuContentClassName,
    triggerClassName,
    ...props
  },
  ref,
) {
  const Action = asChild ? Slot : "button";

  return (
    <DropdownMenu className="inline-flex shrink-0 items-center">
      <Action
        ref={ref}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-l-md rounded-r-none border border-border border-r-0 bg-background px-3 text-sm font-semibold text-foreground ring-offset-background transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          className,
        )}
        {...props}
      >
        {children}
      </Action>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-l-none rounded-r-md border border-border bg-background text-muted-foreground ring-offset-background transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          triggerClassName,
        )}
        aria-label={menuAriaLabel}
        disabled={menuDisabled}
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={menuAlign}
        side={menuSide}
        className={menuContentClassName}
      >
        {menuContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
