import { BRAND_HEX, COMPANY } from '../branding';

// Excel workbooks are built in the browser and loaded on demand.
export type Cell = string | number | null | undefined;

export interface SheetExport {
  filename: string;
  sheet: string;
  /** A title line above the table (company, report name, period). */
  title?: string;
  subtitle?: string;
  head: string[];
  body: Cell[][];
  /** A totals row at the end, bold. */
  foot?: Cell[];
  /** Column indexes holding money (formatted #,##0.00 and summed in Excel's own number type). */
  moneyColumns?: number[];
  widths?: number[];
}

export async function exportXlsx(x: SheetExport): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const money = new Set(x.moneyColumns ?? []);

  const cell = (value: Cell, col: number, extra: Record<string, unknown> = {}) => {
    if (value == null || value === '') return { value: '', ...extra };
    if (typeof value === 'number' && money.has(col)) return { value, type: Number, format: '#,##0.00', align: 'right', ...extra };
    if (typeof value === 'number') return { value, type: Number, ...extra };
    return { value: String(value), ...extra };
  };

  const width = x.head.length;
  const rows: unknown[][] = [];
  if (x.title) rows.push([{ value: x.title, fontWeight: 'bold', fontSize: 14, textColor: BRAND_HEX.navy }, ...Array(width - 1).fill(null)]);
  if (x.subtitle) rows.push([{ value: x.subtitle, textColor: '#646a82' }, ...Array(width - 1).fill(null)]);
  if (x.title || x.subtitle) rows.push([]);

  rows.push(x.head.map((h) => ({ value: h, fontWeight: 'bold', textColor: '#ffffff', backgroundColor: BRAND_HEX.navy, align: 'left' })));
  for (const r of x.body) rows.push(r.map((v, i) => cell(v, i)));
  if (x.foot) rows.push(x.foot.map((v, i) => cell(v, i, { fontWeight: 'bold', backgroundColor: BRAND_HEX.navySoft, textColor: BRAND_HEX.navy })));

  const widths = x.widths ?? x.head.map((h, i) => Math.max(12, Math.min(34, Math.max(h.length + 2, ...x.body.slice(0, 80).map((r) => String(r[i] ?? '').length + 2)))));
  await (writeXlsxFile as unknown as (d: unknown[][], o: Record<string, unknown>) => { toFile: (name: string) => Promise<void> })(rows, {
    sheet: x.sheet.slice(0, 31),
    columns: widths.map((w) => ({ width: w })),
    stickyRowsCount: rows.length - x.body.length - (x.foot ? 1 : 0),
  }).toFile(x.filename);
}

export const exportCompanyLine = (report: string) => `${COMPANY.name}: ${report}`;
