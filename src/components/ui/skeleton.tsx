'use client';

import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, type HTMLMotionProps } from 'framer-motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SkeletonProps
  extends Omit<HTMLMotionProps<'div'>, 'onDrag' | 'ref'> {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'text', width, height, ...props }, ref) => {
    const baseStyles = 'animate-pulse rounded-md bg-muted';
    let w = width;
    let h = height;
    if (variant === 'circular') {
      w = w || '2.5rem';
      h = h || '2.5rem';
    } else if (variant === 'text') {
      h = h || '0.875rem';
      w = w || '100%';
    } else {
      w = w || '100%';
      h = h || '100%';
    }
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(baseStyles, className)}
        style={{ width: w, height: h, ...props.style }}
        ref={ref}
        {...props}
      />
    );
  },
);
Skeleton.displayName = 'Skeleton';

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const SkeletonCard = React.forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'border border-border rounded-xl bg-card p-6 animate-pulse',
        className,
      )}
      {...props}
    />
  ),
);
SkeletonCard.displayName = 'SkeletonCard';

export { cn };
