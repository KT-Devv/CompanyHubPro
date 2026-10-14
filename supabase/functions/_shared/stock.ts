// Pure logic for low-stock alerts. No Deno- or Node-specific imports.

export interface StockItem {
  id: string;
  item_name: string;
  quantity: number;
  min_quantity: number;
  low_alerted_at: string | null;
  store_name: string;
}

export const isLow = (i: Pick<StockItem, 'quantity' | 'min_quantity'>) => i.min_quantity > 0 && i.quantity <= i.min_quantity;

// Newly low: at or below the level and nobody has been told yet.
export const needsAlert = (items: StockItem[]) => items.filter((i) => isLow(i) && !i.low_alerted_at);

// Restocked since the last alert: clear the mark so the next dip alerts again.
export const needsReset = (items: StockItem[]) => items.filter((i) => !isLow(i) && i.low_alerted_at);

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface AlertMessage {
  subject: string;
  text: string;
  html: string;
}

export function buildAlert(items: StockItem[], company = 'TEK International Contractors Ltd.'): AlertMessage | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.store_name.localeCompare(b.store_name) || a.quantity - b.quantity || a.item_name.localeCompare(b.item_name));
  const line = (i: StockItem) => `${i.item_name} (${i.store_name}): ${i.quantity} left, reorder level ${i.min_quantity}`;
  const subject = `Low stock: ${sorted.length} item${sorted.length === 1 ? '' : 's'} to reorder`;
  const text = [`${company}: these items have reached their reorder level.`, '', ...sorted.map((i) => `- ${line(i)}`), '', 'Sent automatically by SiteTrack.'].join('\n');
  const html =
    `<p>${escapeHtml(company)}: these items have reached their reorder level.</p>` +
    `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px"><thead><tr>` +
    ['Item', 'Store', 'Left', 'Reorder at'].map((h) => `<th style="text-align:left;border-bottom:2px solid #222a72;padding:6px 12px 6px 0">${h}</th>`).join('') +
    `</tr></thead><tbody>` +
    sorted
      .map(
        (i) =>
          `<tr><td style="padding:6px 12px 6px 0">${escapeHtml(i.item_name)}</td><td style="padding:6px 12px 6px 0">${escapeHtml(i.store_name)}</td>` +
          `<td style="padding:6px 12px 6px 0;color:${i.quantity <= 0 ? '#b43c3c' : 'inherit'}"><b>${i.quantity}</b></td><td style="padding:6px 0">${i.min_quantity}</td></tr>`,
      )
      .join('') +
    `</tbody></table><p style="color:#646a82;font-size:12px">Sent automatically by SiteTrack.</p>`;
  return { subject, text, html };
}

// Webhook payload: plain and stable, so it can feed Slack/Teams/WhatsApp relays.
export function webhookPayload(items: StockItem[], msg: AlertMessage) {
  return {
    text: msg.text,
    subject: msg.subject,
    items: items.map((i) => ({ id: i.id, item: i.item_name, store: i.store_name, quantity: i.quantity, reorder_level: i.min_quantity })),
  };
}
