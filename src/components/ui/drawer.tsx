'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type DrawerContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
};

const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerPortal = DialogPrimitive.Portal;
const DrawerClose = DialogPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] animate-in',
      'data-[state=closed]:opacity-0',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SIDE_CLASSES: Record<string, string> = {
  left: 'left-0 top-0 h-svh border-r',
  right: 'right-0 top-0 h-svh border-l',
  top: 'top-0 left-0 w-full max-h-[85svh] border-b',
  bottom: 'bottom-0 left-0 w-full max-h-[88svh] border-t rounded-t-2xl',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'w-full sm:w-[360px]',
  md: 'w-full sm:w-[480px]',
  lg: 'w-full sm:w-[600px]',
  xl: 'w-full sm:w-[760px]',
  full: 'w-full',
};

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = 'right', size = 'md', ...props }, ref) => {
  const vertical = side === 'left' || side === 'right';
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden border-border bg-card text-card-foreground shadow-2xl animate-in',
          SIDE_CLASSES[side],
          vertical ? SIZE_CLASSES[size] : 'h-auto',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('shrink-0 border-b border-border px-6 pb-4 pt-6 pr-16', className)}
      {...props}
    />
  ),
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />
  ),
);
DrawerBody.displayName = 'DrawerBody';

const DrawerFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('shrink-0 border-t border-border bg-muted/40 px-6 py-4', className)}
      {...props}
    />
  ),
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
DrawerTitle.displayName = DialogPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-1 text-sm text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  cn,
};
