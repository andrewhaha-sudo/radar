'use client';

import * as React from 'react';
import { cn } from './card';

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <table ref={ref} className={cn('w-full', className)} {...props} />
  ),
);
Table.displayName = 'Table';

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn(className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  TableBodyProps
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn(className)} {...props} />
));
TableBody.displayName = 'TableBody';

export interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  TableFooterProps
>(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn(className)} {...props} />
));
TableFooter.displayName = 'TableFooter';

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn(className)} {...props} />
  ),
);
TableRow.displayName = 'TableRow';

export interface TableCellProps extends React.HTMLAttributes<HTMLTableCellElement> {}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn(className)} {...props} />
  ),
);
TableCell.displayName = 'TableCell';

export interface TableHeadProps extends React.HTMLAttributes<HTMLTableCellElement> {}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn(className)} {...props} />
  ),
);
TableHead.displayName = 'TableHead';

export { cn };
