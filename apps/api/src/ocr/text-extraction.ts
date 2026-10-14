import * as path from 'path';

export type ExtractionStatus = 'done' | 'skipped' | 'failed';

export interface ExtractionResult {
  status: ExtractionStatus;
  text: string;
  error?: string;
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'log',
  'html',
  'htm',
  'yml',
  'yaml',
  'rtf',
]);

const TEXT_MIME_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/csv',
  'application/x-ndjson',
  'application/rtf',
]);

const PDF_EXTENSIONS = new Set(['pdf']);

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'tif',
  'tiff',
  'bmp',
  'webp',
  'gif',
]);

function ext(extension: string | null | undefined): string {
  return (extension ?? '').toLowerCase().replace(/^\./, '');
}

export function isTextLike(mimeType: string, extension: string): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  return (
    mime.startsWith('text/') ||
    TEXT_MIME_EXACT.has(mime) ||
    TEXT_EXTENSIONS.has(ext(extension))
  );
}

export function isPdf(mimeType: string, extension: string): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  return mime === 'application/pdf' || PDF_EXTENSIONS.has(ext(extension));
}

export function isImage(mimeType: string, extension: string): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  return mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext(extension));
}

/**
 * Ekstraksi teks (pipeline OCR §4.3):
 *  - berkas teks/CSV/JSON/XML → langsung dibaca sebagai UTF-8;
 *  - PDF → ekstraksi lapisan teks memakai pdfjs (tanpa jaringan);
 *  - gambar → butuh penyedia OCR eksternal, ditandai `skipped` bila belum ada.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  extension: string,
): Promise<ExtractionResult> {
  if (isTextLike(mimeType, extension)) {
    return { status: 'done', text: buffer.toString('utf8') };
  }
  if (isPdf(mimeType, extension)) {
    return extractPdf(buffer);
  }
  if (isImage(mimeType, extension)) {
    return {
      status: 'skipped',
      text: '',
      error:
        'OCR gambar memerlukan penyedia OCR eksternal (belum dikonfigurasi)',
    };
  }
  return {
    status: 'skipped',
    text: '',
    error: `Tipe berkas ${mimeType || extension || 'tidak dikenal'} tidak didukung untuk ekstraksi teks`,
  };
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // require agar tidak menarik bundler Next/Nest saat build web.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const standardFontDataUrl =
      path.join(
        require.resolve('pdfjs-dist/legacy/build/pdf.js'),
        '..',
        '..',
        '..',
        'standard_fonts',
      ) + path.sep;

    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl,
      verbosity: 0,
    });
    const pdf = await task.promise;
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content.items as Array<{ str?: string }>)
        .map((item) => item.str ?? '')
        .join(' ');
      text += `${pageText}\n`;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        status: 'skipped',
        text: '',
        error:
          'PDF tidak memiliki lapisan teks (kemungkinan hasil pindai); memerlukan OCR gambar',
      };
    }
    return { status: 'done', text: trimmed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'tidak diketahui';
    return {
      status: 'failed',
      text: '',
      error: `Gagal mengekstrak PDF: ${message}`,
    };
  }
}
