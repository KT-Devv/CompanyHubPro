import { format, parseISO } from 'date-fns';
import { BRAND_RGB, COMPANY, loadLogo } from '../branding';
import type { PayrollLine } from '../payroll';

// PDFs are built in the browser and loaded on demand, so the PDF library only
// downloads when someone actually exports. Documents say "GHS" rather than the
// cedi sign: the standard PDF fonts have no glyph for it and would print a box.
export const pdfMoney = (n: number) =>
  `GHS ${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function newDoc(orientation: 'portrait' | 'landscape') {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  return { doc, autoTable: autoTableModule.default };
}

type Doc = Awaited<ReturnType<typeof newDoc>>['doc'];

// Right-aligns the given columns in every part of a table (header and totals
// too, which column styles alone leave on the left).
const alignRight = (cols: number[]) => (data: { column: { index: number }; cell: { styles: { halign?: string } } }) => {
  if (cols.includes(data.column.index)) data.cell.styles.halign = 'right';
};

// The brand band across the top of a page: logo (or wordmark) on the left,
// document title on the right, and a thin red rule underneath.
async function drawHeader(doc: Doc, title: string, subtitle?: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND_RGB.navy);
  doc.rect(0, 0, width, 22, 'F');
  doc.setFillColor(...BRAND_RGB.crimson);
  doc.rect(0, 22, width, 1.2, 'F');

  const logo = await loadLogo();
  if (logo) {
    // On a white tile, since the logo is designed for a light background.
    const h = 14;
    const w = Math.min(46, (logo.width / logo.height) * h);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(10, 4, w + 4, h + 0, 1.5, 1.5, 'F');
    doc.addImage(logo.dataUrl, 'PNG', 12, 4, w, h);
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(COMPANY.short, 12, 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('International Contractors Ltd.', 12, 17.5);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, width - 12, 11.5, { align: 'right' });
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(subtitle, width - 12, 17.5, { align: 'right' });
  }
}

function drawFooters(doc: Doc, note?: string) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND_RGB.line);
    doc.line(10, h - 11, w - 10, h - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_RGB.muted);
    doc.text(`${COMPANY.name}  ·  ${note ?? 'Confidential'}  ·  Generated ${format(new Date(), 'd MMM yyyy, HH:mm')}`, 10, h - 6.5);
    doc.text(`Page ${i} of ${pages}`, w - 10, h - 6.5, { align: 'right' });
  }
}

function watermark(doc: Doc, text: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.saveGraphicsState();
  doc.setGState(new (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState({ opacity: 0.09 }) as never);
  doc.setTextColor(...BRAND_RGB.crimson);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(w > h ? 72 : 60);
  doc.text(text, w / 2, h / 2, { align: 'center', angle: 32 });
  doc.restoreGraphicsState();
}

export interface TablePdf {
  filename: string;
  title: string;
  subtitle?: string;
  head: string[];
  body: (string | number)[][];
  /** A totals row, drawn bold at the end. */
  foot?: (string | number)[];
  landscape?: boolean;
  /** Column indexes (0-based) to right-align, normally the money columns. */
  rightAlign?: number[];
  /** A diagonal stamp across every page, e.g. PROVISIONAL. */
  stamp?: string;
  note?: string;
}

export async function exportTablePdf(t: TablePdf): Promise<void> {
  const { doc, autoTable } = await newDoc(t.landscape ? 'landscape' : 'portrait');
  await drawHeader(doc, t.title, t.subtitle);

  const columnStyles = Object.fromEntries((t.rightAlign ?? []).map((i) => [i, { halign: 'right' as const }]));
  autoTable(doc, {
    startY: 30,
    head: [t.head],
    body: t.body.map((r) => r.map(String)),
    foot: t.foot ? [t.foot.map(String)] : undefined,
    showFoot: 'lastPage',
    theme: 'grid',
    margin: { left: 10, right: 10, bottom: 16 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: BRAND_RGB.ink, lineColor: BRAND_RGB.line, lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_RGB.navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: BRAND_RGB.navySoft, textColor: BRAND_RGB.navy, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 253] },
    columnStyles,
    didParseCell: alignRight(t.rightAlign ?? []),
  });

  if (t.stamp) for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); watermark(doc, t.stamp); }
  drawFooters(doc, t.note);
  doc.save(t.filename);
}

// Last four digits only: a payslip gets handed around and left on desks.
export function maskAccount(account: string): string {
  const digits = account.replace(/\s/g, '');
  return digits.length <= 4 ? digits : `${'*'.repeat(Math.min(6, digits.length - 4))}${digits.slice(-4)}`;
}

export async function exportPayslipsPdf(lines: PayrollLine[], month: string, opts: { provisional: boolean; filename: string }): Promise<number> {
  const payable = lines.filter((l) => l.gross > 0 || l.totalDeductions > 0);
  if (payable.length === 0) return 0;
  const { doc, autoTable } = await newDoc('portrait');
  const period = format(parseISO(`${month}-01`), 'MMMM yyyy');
  const w = doc.internal.pageSize.getWidth();

  for (let i = 0; i < payable.length; i++) {
    const l = payable[i];
    if (i > 0) doc.addPage();
    await drawHeader(doc, 'PAYSLIP', period);

    // Who it is for
    doc.setTextColor(...BRAND_RGB.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(l.name || 'Unnamed worker', 12, 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_RGB.muted);
    doc.text(`${l.jobTitle}  ·  ${l.siteName}`, 12, 41.5);

    autoTable(doc, {
      startY: 47,
      theme: 'plain',
      margin: { left: 12, right: 12 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.2, bottom: 1.2, left: 0, right: 2 }, textColor: BRAND_RGB.ink },
      columnStyles: { 0: { textColor: BRAND_RGB.muted, cellWidth: 34 }, 2: { textColor: BRAND_RGB.muted, cellWidth: 34 } },
      body: [
        ['National ID', l.nationalId || '-', 'Pay type', l.fixed ? 'Monthly salary' : 'Daily rate'],
        ['Bank', l.bankName || '-', l.fixed ? 'Monthly rate' : 'Daily rate', pdfMoney(l.rate)],
        ['Account', l.accountNumber === '-' ? '-' : maskAccount(l.accountNumber), l.fixed ? 'Days worked' : 'Days worked', l.fixed ? 'Full month' : String(l.daysPresent)],
      ],
    });

    const afterInfo = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    const row = (label: string, amount: number, negative = false): (string | number)[] => [label, negative && amount > 0 ? `- ${pdfMoney(amount)}` : pdfMoney(amount)];

    autoTable(doc, {
      startY: afterInfo,
      head: [['Earnings', 'Amount']],
      body: [row(l.fixed ? 'Monthly salary' : `Basic pay (${l.daysPresent} days x ${pdfMoney(l.rate)})`, l.gross)],
      foot: [['Gross pay', pdfMoney(l.gross)]],
      theme: 'grid',
      margin: { left: 12, right: 12 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: BRAND_RGB.ink, lineColor: BRAND_RGB.line, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_RGB.navy, textColor: [255, 255, 255] },
      footStyles: { fillColor: BRAND_RGB.navySoft, textColor: BRAND_RGB.navy, fontStyle: 'bold' },
      didParseCell: alignRight([1]),
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [['Deductions', 'Amount']],
      body: [
        row('SSNIT (employee 5.5%)', l.ssnit, true),
        row('Income tax', l.tax, true),
        row('Salary advances', l.advances, true),
        row('Loan repayments', l.loans, true),
        row('Other deductions', l.otherDeductions, true),
      ],
      foot: [['Total deductions', l.totalDeductions > 0 ? `- ${pdfMoney(l.totalDeductions)}` : pdfMoney(0)]],
      theme: 'grid',
      margin: { left: 12, right: 12 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: BRAND_RGB.ink, lineColor: BRAND_RGB.line, lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_RGB.navy, textColor: [255, 255, 255] },
      footStyles: { fillColor: BRAND_RGB.navySoft, textColor: BRAND_RGB.navy, fontStyle: 'bold' },
      didParseCell: alignRight([1]),
    });

    // Net pay: the number the worker looks for
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFillColor(...BRAND_RGB.navy);
    doc.roundedRect(12, y, w - 24, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('NET PAY', 18, y + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(pdfMoney(l.net), w - 18, y + 10.5, { align: 'right' });

    if (l.overdrawn) {
      doc.setTextColor(...BRAND_RGB.crimson);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('Deductions this month were more than pay earned, so net pay is shown as zero.', 12, y + 22);
    }
    if (opts.provisional) watermark(doc, 'PROVISIONAL');
  }

  drawFooters(doc, opts.provisional ? 'Provisional: month not yet closed' : 'Confidential');
  doc.save(opts.filename);
  return payable.length;
}
