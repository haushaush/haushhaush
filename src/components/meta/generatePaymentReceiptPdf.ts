import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PaymentReceipt } from './MetaPaymentsTab';
import { formatCurrency } from './metaUtils';

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(iso); }
}

function sanitize(s: string) {
  return s.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Unbekannt';
}

export function canGeneratePdf(r: PaymentReceipt): boolean {
  return !!r.transaction_id && r.amount != null && !!r.currency
    && !!(r.meta_account_id || r.meta_account_id_numeric || r.account_name);
}

export function generatePaymentReceiptPdf(r: PaymentReceipt) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Meta-Zahlungsbeleg', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Interne Kopie eines Meta-Zahlungsbelegs — keine offizielle Rechnung.', margin, y + 12);
  y += 28;

  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Zahlungsdetails', margin, y);
  y += 6;

  const rows: Array<[string, string]> = [
    ['Werbekonto', r.account_name || '–'],
    ['Meta Account ID', r.meta_account_id || r.meta_account_id_numeric || '–'],
    ['Transaktions-ID', r.transaction_id || '–'],
    ['Datum', fmtDate(r.transaction_date)],
    ['Betrag', r.amount != null ? formatCurrency(r.amount, r.currency || 'EUR') : '–'],
    ['Währung', r.currency || '–'],
    ['Zahlungsmethode', r.payment_method || '–'],
    ['Status', r.payment_status_label || r.payment_status || '–'],
    ['Grund', r.billing_reason || '–'],
    ['Produkt', r.product_type || '–'],
    ['Abrechnungszeitraum',
      r.period_start_raw && r.period_end_raw
        ? `${r.period_start_raw} – ${r.period_end_raw}`
        : '–'],
    ['Quelle', 'Meta E-Mail (n8n Import)'],
    ['Dokumenttyp', 'Zahlungsbeleg'],
  ];

  autoTable(doc, {
    startY: y + 6,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 4, textColor: 30 },
    columnStyles: {
      0: { cellWidth: 160, textColor: 110, fontStyle: 'bold' },
      1: { cellWidth: pageWidth - margin * 2 - 160 },
    },
    body: rows,
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 20;

  // Campaigns
  if (Array.isArray(r.campaigns) && r.campaigns.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Kampagnenaufschlüsselung', margin, y);
    autoTable(doc, {
      startY: y + 8,
      head: [['Kampagne', 'Ergebnisse', 'Typ', 'Betrag']],
      body: r.campaigns.map((c) => [
        c.name || '–',
        c.results != null ? Number(c.results).toLocaleString('de-DE') : '–',
        c.result_type || '–',
        c.amount != null ? formatCurrency(Number(c.amount), c.currency || r.currency || 'EUR') : '–',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [240, 240, 240], textColor: 40, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220);
  doc.line(margin, pageHeight - 60, pageWidth - margin, pageHeight - 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text(
    'Dieses Dokument ist ein intern erzeugter Beleg auf Basis der von Meta per E-Mail versendeten Zahlungsbestätigung. ' +
    'Es handelt sich ausdrücklich nicht um eine offizielle Rechnung von Meta.',
    margin, pageHeight - 44, { maxWidth: pageWidth - margin * 2 }
  );
  if (r.email_subject) {
    doc.text(`E-Mail: ${r.email_subject}${r.email_received_at ? ` · ${fmtDate(r.email_received_at)}` : ''}`,
      margin, pageHeight - 22, { maxWidth: pageWidth - margin * 2 });
  }

  const datePart = r.transaction_date
    ? new Date(r.transaction_date).toISOString().slice(0, 10)
    : 'ohne-datum';
  const accountPart = sanitize(r.account_name || r.meta_account_id || r.meta_account_id_numeric || 'Konto');
  const txPart = sanitize(r.transaction_id || 'ohne-id');
  const filename = `Meta-Zahlungsbeleg_${accountPart}_${datePart}_${txPart}.pdf`;
  doc.save(filename);
}
