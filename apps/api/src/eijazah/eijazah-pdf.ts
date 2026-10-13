import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/**
 * Pembuat berkas ijazah (PDF) memakai pdfkit + QR verifikasi. Ukuran A4
 * landscape, memakai font standar PDF sehingga ringan dan deterministik.
 */

export interface EijazahPdfInput {
  schoolName: string;
  npsn?: string | null;
  city?: string | null;
  studentName: string;
  nisn?: string | null;
  nis?: string | null;
  gender?: string | null;
  birthDate?: Date | null;
  academicYearName: string;
  serialNumber: string;
  status: string;
  issuedAt?: Date | null;
  signature?: string | null;
  headmaster?: string | null;
  qrPayload: string;
  verificationUrl: string;
}

const MARGIN = 40;

function formatDate(value?: Date | null): string {
  if (!value) return '-';
  return value.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function statusLabel(status: string): string | null {
  if (status === 'issued') return null;
  if (status === 'revoked') return 'DICABUT';
  return 'DRAF';
}

function drawWatermark(doc: PDFKit.PDFDocument, label: string): void {
  doc.save();
  doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(110)
    .fillColor('#000000')
    .opacity(0.06)
    .text(label, 0, doc.page.height / 2 - 60, {
      width: doc.page.width,
      align: 'center',
    });
  doc.opacity(1);
  doc.fillColor('#000000');
  doc.restore();
}

export async function buildEijazahPdf(
  input: EijazahPdfInput,
): Promise<Buffer> {
  const qrPng = await QRCode.toBuffer(input.qrPayload, {
    type: 'png',
    width: 220,
    margin: 1,
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      render(doc, input, qrPng);
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
}

function render(
  doc: PDFKit.PDFDocument,
  input: EijazahPdfInput,
  qrPng: Buffer,
): void {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentRight = pageWidth - MARGIN;

  // Bingkai hias.
  doc
    .lineWidth(3)
    .rect(MARGIN - 10, MARGIN - 10, pageWidth - 2 * (MARGIN - 10), pageHeight - 2 * (MARGIN - 10))
    .stroke('#1f3a5f');
  doc
    .lineWidth(1)
    .rect(MARGIN - 4, MARGIN - 4, pageWidth - 2 * (MARGIN - 4), pageHeight - 2 * (MARGIN - 4))
    .stroke('#1f3a5f');

  const watermark = statusLabel(input.status);
  if (watermark) drawWatermark(doc, watermark);

  // Kop.
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#1f3a5f')
    .text(input.schoolName.toUpperCase(), { align: 'center' });
  if (input.npsn) {
    doc.font('Helvetica').fontSize(9).fillColor('#333333');
    doc.text(`NPSN: ${input.npsn}`, { align: 'center' });
  }

  doc.moveDown(0.6);
  doc
    .font('Helvetica-Bold')
    .fontSize(26)
    .fillColor('#000000')
    .text('IJAZAH', { align: 'center', characterSpacing: 4 });
  doc.font('Helvetica').fontSize(11).fillColor('#333333');
  doc.text(`Tahun Ajaran ${input.academicYearName}`, { align: 'center' });
  doc.moveDown(0.4);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#000000')
    .text(`Nomor: ${input.serialNumber}`, { align: 'center' });

  doc.moveDown(1.2);

  // Badan.
  const bodyLeft = MARGIN + 20;
  doc.font('Helvetica').fontSize(11).fillColor('#000000');
  doc.text(
    `Kepala ${input.schoolName} dengan ini menerangkan bahwa:`,
    bodyLeft,
    doc.y,
    { width: contentRight - bodyLeft - 260 },
  );
  doc.moveDown(0.8);

  const rows: Array<[string, string]> = [
    ['Nama', input.studentName],
    ['NISN', input.nisn ?? '-'],
    ['NIS', input.nis ?? '-'],
    ['Jenis Kelamin', input.gender === 'P' ? 'Perempuan' : input.gender === 'L' ? 'Laki-laki' : (input.gender ?? '-')],
    ['Tanggal Lahir', formatDate(input.birthDate)],
  ];
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fillColor('#555555').text(label, bodyLeft, y, { width: 130 });
    doc.font('Helvetica-Bold').fillColor('#000000').text(`: ${value}`, bodyLeft + 120, y, {
      width: contentRight - bodyLeft - 260,
    });
  }

  doc.moveDown(0.8);
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
  doc.text(
    `telah dinyatakan LULUS dari satuan pendidikan ini. Ijazah ini diterbitkan secara elektronik dan dapat diverifikasi keasliannya melalui tautan/QR di bawah.`,
    bodyLeft,
    doc.y,
    { width: contentRight - bodyLeft - 240 },
  );

  // QR verifikasi (kiri bawah).
  const qrSize = 110;
  const qrX = bodyLeft;
  const qrY = pageHeight - MARGIN - qrSize - 6;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text('Pindai untuk verifikasi', qrX, qrY + qrSize + 2, { width: 170 });
  doc.fontSize(7).text(input.verificationUrl, qrX, doc.y, { width: 190 });

  // Blok tanda tangan (kanan bawah).
  const colWidth = 230;
  const rightX = contentRight - colWidth - 20;
  const signY = pageHeight - MARGIN - 130;
  doc.font('Helvetica').fontSize(10).fillColor('#000000');
  doc.text(
    input.city ? `${input.city}, ${formatDate(input.issuedAt)}` : formatDate(input.issuedAt),
    rightX,
    signY,
    { width: colWidth },
  );
  doc.text('Kepala Sekolah', rightX, signY + 18, { width: colWidth });
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text(input.headmaster ?? '........................', rightX, signY + 70, {
    width: colWidth,
  });
  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text('Ditandatangani secara elektronik', rightX, signY + 88, {
    width: colWidth,
  });
  if (input.signature) {
    doc
      .font('Courier')
      .fontSize(6)
      .text(`Sig: ${input.signature.slice(0, 48)}…`, rightX, signY + 100, {
        width: colWidth,
      });
  }
  doc.fillColor('#000000');
}
