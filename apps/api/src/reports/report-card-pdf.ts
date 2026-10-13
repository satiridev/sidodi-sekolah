import PDFDocument from 'pdfkit';

/**
 * Pembuat berkas raport (PDF) sederhana namun rapi, memakai pdfkit. Tidak butuh
 * font eksternal (memakai font standar PDF) sehingga ringan dan deterministik.
 */

export interface ReportCardGradeRow {
  subject: string;
  code?: string | null;
  score: number;
  note?: string | null;
}

export interface ReportCardPdfInput {
  schoolName: string;
  city?: string | null;
  studentName: string;
  nisn?: string | null;
  nis?: string | null;
  gender?: string | null;
  classroomName: string;
  academicYearName: string;
  semesterName: string;
  grades: ReportCardGradeRow[];
  homeroomTeacher?: string | null;
  headmaster?: string | null;
  generatedAt: Date;
}

const MARGIN = 50;
const CONTENT_RIGHT = 545;
const BOTTOM_LIMIT = 750;

const COL_NO = 50;
const COL_SUBJECT = 82;
const COL_SCORE = 375;
const COL_NOTE = 445;

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
}

function drawTableHeader(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('No', COL_NO, y);
  doc.text('Mata Pelajaran', COL_SUBJECT, y, { width: 280 });
  doc.text('Nilai', COL_SCORE, y, { width: 60, align: 'right' });
  doc.text('Catatan', COL_NOTE, y, { width: 100 });
  doc
    .moveTo(COL_NO, y + 14)
    .lineTo(CONTENT_RIGHT, y + 14)
    .stroke();
  doc.y = y + 20;
}

function drawDataRow(
  doc: PDFKit.PDFDocument,
  index: number,
  row: ReportCardGradeRow,
): void {
  doc.font('Helvetica').fontSize(10);
  const subjectHeight = doc.heightOfString(row.subject, { width: 280 });
  const rowHeight = Math.max(16, subjectHeight + 4);

  if (doc.y + rowHeight > BOTTOM_LIMIT) {
    doc.addPage();
    drawTableHeader(doc);
  }

  const startY = doc.y;
  doc.text(String(index), COL_NO, startY);
  doc.text(row.subject, COL_SUBJECT, startY, { width: 280 });
  doc.text(formatScore(row.score), COL_SCORE, startY, {
    width: 60,
    align: 'right',
  });
  doc.text(row.note && row.note.trim() ? row.note : '-', COL_NOTE, startY, {
    width: 100,
  });
  doc.y = startY + rowHeight;
}

function drawSignatureBlock(
  doc: PDFKit.PDFDocument,
  input: ReportCardPdfInput,
  signatureY: number,
): void {
  const colWidth = 200;
  const leftX = MARGIN + 20;
  const rightX = CONTENT_RIGHT - colWidth - 20;

  doc.font('Helvetica').fontSize(10);
  doc.text(input.city ? `${input.city}, ` : '', leftX, signatureY, {
    width: colWidth,
    continued: false,
  });
  doc.text(
    `Tanggal: ${input.generatedAt.toLocaleDateString('id-ID')}`,
    leftX,
    doc.y,
    { width: colWidth },
  );

  const roleY = signatureY + 20;
  doc.text('Wali Kelas', leftX, roleY, { width: colWidth });
  doc.text('Kepala Sekolah', rightX, roleY, { width: colWidth });

  const nameY = roleY + 55;
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(input.homeroomTeacher ?? '........................', leftX, nameY, {
    width: colWidth,
  });
  doc.text(input.headmaster ?? '........................', rightX, nameY, {
    width: colWidth,
  });
  doc.font('Helvetica').fontSize(8).fillColor('#555555');
  doc.text('Ditandatangani secara elektronik', leftX, nameY + 16, {
    width: colWidth,
  });
  doc.text('Ditandatangani secara elektronik', rightX, nameY + 16, {
    width: colWidth,
  });
  doc.fillColor('#000000');
}

function render(doc: PDFKit.PDFDocument, input: ReportCardPdfInput): void {
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(input.schoolName.toUpperCase(), { align: 'center' });
  doc.moveDown(0.2);
  doc
    .font('Helvetica')
    .fontSize(12)
    .text('LAPORAN HASIL BELAJAR (RAPORT)', { align: 'center' });
  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(
      `Tahun Ajaran ${input.academicYearName} — ${input.semesterName}`,
      { align: 'center' },
    );

  doc.moveDown(1);
  const ruleY = doc.y;
  doc.moveTo(MARGIN, ruleY).lineTo(CONTENT_RIGHT, ruleY).stroke();
  doc.moveDown(1);

  doc.font('Helvetica').fontSize(11);
  const info: Array<[string, string]> = [
    ['Nama', input.studentName],
    ['NISN', input.nisn ?? '-'],
    ['NIS', input.nis ?? '-'],
    ['Kelas', input.classroomName],
  ];
  for (const [label, value] of info) {
    doc.text(`${label}: ${value}`);
  }

  doc.moveDown(1);
  drawTableHeader(doc);

  let total = 0;
  input.grades.forEach((row, idx) => {
    total += row.score;
    drawDataRow(doc, idx + 1, row);
  });

  if (input.grades.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10);
    doc.text('Belum ada nilai pada semester ini.', COL_SUBJECT, doc.y, {
      width: 280,
    });
    doc.moveDown(0.5);
  }

  const average =
    input.grades.length > 0 ? total / input.grades.length : 0;
  doc.moveDown(0.5);
  doc
    .moveTo(COL_NO, doc.y)
    .lineTo(CONTENT_RIGHT, doc.y)
    .stroke();
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text(
    `Rata-rata: ${input.grades.length > 0 ? average.toFixed(2) : '-'}`,
    COL_SCORE,
    doc.y,
    { width: 160, align: 'right' },
  );

  const signatureY = Math.max(doc.y + 40, 640);
  drawSignatureBlock(doc, input, signatureY);
}

export function buildReportCardPdf(input: ReportCardPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      render(doc, input);
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
}
