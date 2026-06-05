"use client";

import { Button } from "@/components/ui/button";

type ProductHelpButtonProps = {
  title: string;
  gradientId: string;
  startColor: string;
  middleColor: string;
  endColor: string;
  dotColor: string;
  onClick: () => void;
};

export function ProductHelpButton({
  title,
  gradientId,
  startColor,
  middleColor,
  endColor,
  dotColor,
  onClick,
}: ProductHelpButtonProps) {
  const gradientRef = `url(#${gradientId})`;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      title={title}
      className="text-foreground hover:bg-accent relative"
    >
      <div className="help-icon-wrapper">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 sm:h-6 sm:w-6"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={startColor} />
              <stop offset="50%" stopColor={middleColor} />
              <stop offset="100%" stopColor={endColor} />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10" stroke={gradientRef} />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke={gradientRef} />
          <circle cx="12" cy="17" r="0.35" fill={dotColor} />
        </svg>
      </div>
    </Button>
  );
}
