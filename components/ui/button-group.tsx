"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex",
          orientation === "horizontal" ? "flex-row" : "flex-col",
          className
        )}
        {...props}
      />
    );
  }
);
ButtonGroup.displayName = "ButtonGroup";

export interface ButtonGroupTextProps extends React.HTMLAttributes<HTMLSpanElement> {}

const ButtonGroupText = React.forwardRef<HTMLSpanElement, ButtonGroupTextProps>(
  ({ className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn("inline-flex items-center", className)}
        {...props}
      />
    );
  }
);
ButtonGroupText.displayName = "ButtonGroupText";

export { ButtonGroup, ButtonGroupText };
