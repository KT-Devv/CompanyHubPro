import { downloadCsv } from '../csv';
import { COMPANY } from '../branding';
import { exportXlsx, type Cell } from './xlsx';
import type { ExportFormat } from '@/components/common/export-menu';

// One definition of a table gives all three downloads, so Excel, PDF and CSV
// can never disagree about what a report contains.
export interface TableExport {
  /** File name without extension. */
  baseName: string;
  title: string;
  subtitle?: string;
  head: string[];
  body: Cell[][];
  foot?: Cell[];
  /** Columns holding money: shown with 2 decimals everywhere. */
  moneyColumns?: number[];
  landscape?: boolean;
  /** Diagonal stamp on every PDF page, e.g. PROVISIONAL. */
  stamp?: string;
  sheet?: string;
}

const money2 = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function exportTable(format: ExportFormat, t: TableExport): Promise<void> {
  const moneyCols = new Set(t.moneyColumns ?? []);
  // CSV/PDF are text: money gets fixed decimals. Excel keeps real numbers, formatted by the cell.
  const asText = (row: Cell[]) => row.map((v, i) => (typeof v === 'number' && moneyCols.has(i) ? money2(v) : v == null ? '' : String(v)));

  if (format === 'xlsx') {
    return exportXlsx({
      filename: `${t.baseName}.xlsx`,
      sheet: t.sheet ?? t.title,
      title: `${COMPANY.name}: ${t.title}`,
      subtitle: t.subtitle,
      head: t.head,
      body: t.body,
      foot: t.foot,
      moneyColumns: t.moneyColumns,
    });
  }
  if (format === 'csv') {
    const toRaw = (row: Cell[]) => row.map((v, i) => (typeof v === 'number' && moneyCols.has(i) ? v.toFixed(2) : v == null ? '' : v));
    return downloadCsv(`${t.baseName}.csv`, [t.head, ...t.body.map(toRaw), ...(t.foot ? [toRaw(t.foot)] : [])] as (string | number)[][]);
  }
  const { exportTablePdf } = await import('./pdf');
  return exportTablePdf({
    filename: `${t.baseName}.pdf`,
    title: t.title,
    subtitle: t.subtitle,
    head: t.head,
    body: t.body.map(asText),
    foot: t.foot ? asText(t.foot) : undefined,
    landscape: t.landscape ?? t.head.length > 6,
    rightAlign: Array.from(moneyCols),
    stamp: t.stamp,
  });
}
