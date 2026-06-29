"use client";

import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ButtonHTMLAttributes,
  type ElementType,
  type ReactNode,
} from "react";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ImageOverlayIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: ElementType;
  children: ReactNode;
};

export const ImageOverlayIconButton = forwardRef<
  HTMLButtonElement,
  ImageOverlayIconButtonProps
>(function ImageOverlayIconButton(
  { as: Component = "button", className, children, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background/90 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

export const ImageOverlayDragHandleButton = forwardRef<
  HTMLButtonElement,
  ImageOverlayIconButtonProps
>(function ImageOverlayDragHandleButton(
  { as: Component = "button", className, children, ...props },
  ref,
) {
  return (
    <Component
      ref={ref}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md bg-background/25 text-foreground backdrop-blur transition-colors hover:bg-background/45 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
});

type ImageOverlayMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuContent
>;

export const ImageOverlayMenuContent = forwardRef<
  HTMLDivElement,
  ImageOverlayMenuContentProps
>(function ImageOverlayMenuContent({ className, ...props }, ref) {
  return (
    <DropdownMenuContent
      ref={ref}
      className={cn(
        "border-border/45 bg-background/80 text-foreground shadow-xl backdrop-blur",
        className,
      )}
      {...props}
    />
  );
});
