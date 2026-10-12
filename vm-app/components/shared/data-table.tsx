import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  key: string;
  header?: ReactNode;
  /** Classes for this column's <th>; falls back to the table-level headClassName. */
  headClassName?: string;
  /** Classes for every <td> in this column. */
  cellClassName?: string;
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowClassName?: string;
  headerClassName?: string;
  headerRowClassName?: string;
  headClassName?: string;
  emptyMessage?: ReactNode;
  emptyClassName?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  headerClassName = "bg-muted/40",
  headerRowClassName,
  headClassName = "text-xs font-semibold",
  emptyMessage,
  emptyClassName = "text-center py-10 text-xs text-muted-foreground",
  onRowClick,
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader className={headerClassName}>
        <TableRow className={headerRowClassName}>
          {columns.map((column) => (
            <TableHead key={column.key} className={column.headClassName ?? headClassName}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && emptyMessage ? (
          <TableRow>
            <TableCell colSpan={columns.length} className={emptyClassName}>
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              className={rowClassName}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <TableCell key={column.key} className={column.cellClassName}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
