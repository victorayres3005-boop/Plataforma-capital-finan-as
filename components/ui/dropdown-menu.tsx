"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuPortal = MenuPrimitive.Portal;
const DropdownMenuGroup = MenuPrimitive.Group;
const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup> & {
    sideOffset?: number;
  }
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPortal>
    <MenuPrimitive.Positioner sideOffset={sideOffset}>
      <MenuPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-md",
          "data-[open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </DropdownMenuPortal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none transition-colors",
      "data-[highlighted]:bg-slate-100 data-[highlighted]:text-cf-text-1",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      destructive
        ? "text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-700"
        : "text-cf-text-2",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-3 py-1.5 text-xs font-semibold text-cf-text-3 uppercase tracking-wider", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-slate-100", className)} role="separator" />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
};
