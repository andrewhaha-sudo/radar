'use client';

import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface FormFieldProps {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
  className?: string;
}

export const FormField = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & FormFieldProps
>(({ className, label, error, helper, required, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('space-y-1 w-full', className)} {...props}>
      {label && (
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {label} {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!error && helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
});
FormField.displayName = 'FormField';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helper, required, ...props }, ref) => {
    return (
      <FormField label={label} error={error} helper={helper} required={required}>
        <input
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        />
      </FormField>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helper, required, ...props }, ref) => {
    return (
      <FormField label={label} error={error} helper={helper} required={required}>
        <textarea
          ref={ref}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        />
      </FormField>
    );
  },
);
Textarea.displayName = 'Textarea';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helper?: string;
  required?: boolean;
  options: { label: string; value: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helper, required, options, ...props }, ref) => {
    return (
      <FormField label={label} error={error} helper={helper} required={required}>
        <select
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        >
          <option value="">Select an option</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>
    );
  },
);
Select.displayName = 'Select';

export interface CheckboxProps {
  label: string;
  error?: string;
  required?: boolean;
}

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & CheckboxProps
>(({ className, label, error, required, ...props }, ref) => {
  return (
    <FormField error={error} required={required} className="space-y-0">
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            'h-4 w-4 rounded border border-input bg-background text-accent-foreground focus:ring-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=checked]:border-accent',
            className,
          )}
          {...props}
        />
        <label className="text-sm font-medium leading-none cursor-pointer select-none">
          {label} {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
      </div>
      {error && <p className="text-xs text-destructive ml-4">{error}</p>}
    </FormField>
  );
});
Checkbox.displayName = 'Checkbox';

export { cn };
