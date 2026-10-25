'use client';

import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helper, id, ...props }, ref) => {
    const generated = React.useId();
    const inputId = id ?? generated;
    const describedBy = error ? `${inputId}-error` : helper ? `${inputId}-helper` : undefined;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium leading-none text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus-visible:border-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            error && 'border-destructive focus-visible:ring-destructive/40',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-destructive">
            {error}
          </p>
        )}
        {!error && helper && (
          <p id={`${inputId}-helper`} className="text-xs text-muted-foreground">
            {helper}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
  label?: string;
  error?: string;
  helper?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helper, id, ...props }, ref) => {
    const generated = React.useId();
    const inputId = id ?? generated;
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium leading-none text-foreground">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'flex min-h-[96px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors',
            'placeholder:text-muted-foreground',
            'focus-visible:border-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive/40',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {!error && helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

export { cn };
