import { PrismaService } from '../prisma/prisma.service';

/**
 * Memperbarui kolom `search_vector` (tsvector) untuk seluruh versi sebuah
 * dokumen. Teks yang diindeks: judul, deskripsi, hasil OCR, dan nama berkas.
 *
 * Dipakai setelah OCR selesai, setelah judul dokumen diubah, dan saat versi
 * baru dibuat. Memakai konfigurasi bahasa `indonesian` (Indonesia + Inggris
 * dasar), sesuai spec §4.3.
 */
export async function reindexDocument(
  prisma: PrismaService,
  documentId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE document_versions v
    SET search_vector = to_tsvector(
      'indonesian',
      coalesce(d.title, '') || ' ' ||
      coalesce(d.description, '') || ' ' ||
      coalesce(v.ocr_text, '') || ' ' ||
      coalesce(v.file_name, '')
    )
    FROM documents d
    WHERE v.document_id = d.id AND d.id = ${documentId}::uuid
  `;
}
