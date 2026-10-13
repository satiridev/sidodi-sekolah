import { test, expect } from './fixtures';
import {
  auth,
  createDocument,
  json,
  registerUser,
  setupSchool,
  uploadAndComplete,
} from './helpers';

interface Version {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  sizeBytes: string;
  contentHash: string;
  changeNote: string | null;
}

test.describe('Versioning Dokumen', () => {
  test('unggahan baru ke dokumen sama menaikkan nomor versi + catatan perubahan', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Versioning',
    });

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'v1.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('konten versi satu ' + Date.now()),
      changeNote: 'Versi awal',
    });
    expect(v1.complete.versionNumber).toBe(1);

    const v2 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'v2.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('konten versi dua yang berbeda ' + Date.now()),
      changeNote: 'Revisi kedua',
    });
    expect(v2.complete.versionNumber).toBe(2);

    const listRes = await request.get(`/documents/${doc.id}/versions`, {
      headers: auth(user.token),
    });
    const list = await json<Version[]>(listRes, 200);
    expect(list).toHaveLength(2);
    expect(list.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(list[0].changeNote).toBe('Revisi kedua');
    expect(list[1].changeNote).toBe('Versi awal');

    const getRes = await request.get(`/documents/${doc.id}`, {
      headers: auth(user.token),
    });
    const full = await json<{ currentVersionId: string }>(getRes, 200);
    expect(full.currentVersionId).toBe(v2.complete.versionId);
  });

  test('detail versi dan 404 untuk versi milik dokumen lain', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const docA = await createDocument(request, user.token, school.id, {
      title: 'Dokumen A',
    });
    const docB = await createDocument(request, user.token, school.id, {
      title: 'Dokumen B',
    });

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: docA.id,
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('isi A ' + Date.now()),
    });

    const detailRes = await request.get(
      `/documents/${docA.id}/versions/${v1.complete.versionId}`,
      { headers: auth(user.token) },
    );
    const detail = await json<Version>(detailRes, 200);
    expect(detail.id).toBe(v1.complete.versionId);
    expect(detail.documentId).toBe(docA.id);

    // Versi milik dokumen A tidak dapat diakses lewat dokumen B.
    const wrongRes = await request.get(
      `/documents/${docB.id}/versions/${v1.complete.versionId}`,
      { headers: auth(user.token) },
    );
    expect(wrongRes.status()).toBe(404);
  });

  test('unduh versi lama mengembalikan byte versi tersebut', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Unduh Versi',
    });

    const contentV1 = Buffer.from('VERSI-SATU ' + Date.now());
    const contentV2 = Buffer.from('VERSI-DUA-LBH-PANJANG ' + Date.now());

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'lama.pdf',
      mimeType: 'application/pdf',
      content: contentV1,
    });
    await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'baru.pdf',
      mimeType: 'application/pdf',
      content: contentV2,
    });

    const res = await request.get(
      `/documents/${doc.id}/versions/${v1.complete.versionId}/download`,
      { headers: auth(user.token) },
    );
    expect(res.status()).toBe(200);
    expect(Buffer.from(await res.body()).equals(contentV1)).toBe(true);
  });

  test('bandingkan dua versi mendeteksi perubahan konten & ukuran', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Bandingkan',
    });

    const a = Buffer.from('AAA');
    const b = Buffer.from('BBBBBB');

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      content: a,
    });
    const v2 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
      content: b,
    });

    const url = `/documents/${doc.id}/versions/compare?from=${v1.complete.versionId}&to=${v2.complete.versionId}`;
    const res = await request.get(url, { headers: auth(user.token) });
    const result = await json<{
      contentChanged: boolean;
      sizeDeltaBytes: string;
      metadataChanges: Array<{ field: string }>;
    }>(res, 200);

    expect(result.contentChanged).toBe(true);
    expect(result.sizeDeltaBytes).toBe(String(b.length - a.length));
    const fields = result.metadataChanges.map((c) => c.field);
    expect(fields).toContain('contentHash');
    expect(fields).toContain('sizeBytes');
    expect(fields).not.toContain('fileName');
  });

  test('restore versi lama menjadi versi baru (konten kembali)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Restore',
    });

    const contentV1 = Buffer.from('KONTEN-ASLI ' + Date.now());
    const contentV2 = Buffer.from('KONTEN-RUSAK-DIPERBAIKI ' + Date.now());

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'asli.pdf',
      mimeType: 'application/pdf',
      content: contentV1,
    });
    await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'rusak.pdf',
      mimeType: 'application/pdf',
      content: contentV2,
    });

    const restoreRes = await request.post(
      `/documents/${doc.id}/versions/${v1.complete.versionId}/restore`,
      { headers: auth(user.token), data: {} },
    );
    const restored = await json<Version>(restoreRes, 201);
    expect(restored.versionNumber).toBe(3);
    expect(restored.contentHash).toBe(v1.complete.contentHash);
    expect(restored.changeNote).toBe('Dipulihkan dari versi 1');

    // Versi terkini menunjuk versi hasil pemulihan.
    const getRes = await request.get(`/documents/${doc.id}`, {
      headers: auth(user.token),
    });
    const full = await json<{ currentVersionId: string }>(getRes, 200);
    expect(full.currentVersionId).toBe(restored.id);

    // Unduhan versi terkini mengembalikan byte versi asli.
    const dl = await request.get(
      `/documents/${doc.id}/versions/${restored.id}/download`,
      { headers: auth(user.token) },
    );
    expect(dl.status()).toBe(200);
    expect(Buffer.from(await dl.body()).equals(contentV1)).toBe(true);

    // Riwayat kini berisi 3 versi; versi lama tidak dihapus.
    const listRes = await request.get(`/documents/${doc.id}/versions`, {
      headers: auth(user.token),
    });
    const list = await json<Version[]>(listRes, 200);
    expect(list).toHaveLength(3);
  });

  test('restore dengan catatan perubahan kustom', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Restore Catatan',
    });

    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'v1.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('satu ' + Date.now()),
    });
    await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'v2.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('dua beda ' + Date.now()),
    });

    const restoreRes = await request.post(
      `/documents/${doc.id}/versions/${v1.complete.versionId}/restore`,
      {
        headers: auth(user.token),
        data: { changeNote: 'Kembalikan ke draf awal' },
      },
    );
    const restored = await json<Version>(restoreRes, 201);
    expect(restored.changeNote).toBe('Kembalikan ke draf awal');
  });

  test('restore versi tak dikenal → 404', async ({ request }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Restore 404',
    });
    await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'v1.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('isi ' + Date.now()),
    });

    const res = await request.post(
      `/documents/${doc.id}/versions/00000000-0000-0000-0000-000000000000/restore`,
      { headers: auth(user.token), data: {} },
    );
    expect(res.status()).toBe(404);
  });

  test('non-anggota tidak dapat melihat/memulihkan versi (403)', async ({
    request,
  }) => {
    const { user, school } = await setupSchool(request);
    const doc = await createDocument(request, user.token, school.id, {
      title: 'Dokumen Rahasia Versi',
    });
    const v1 = await uploadAndComplete(request, user.token, {
      schoolId: school.id,
      documentId: doc.id,
      fileName: 'rahasia.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('rahasia ' + Date.now()),
    });

    const outsider = await registerUser(request);

    const listRes = await request.get(`/documents/${doc.id}/versions`, {
      headers: auth(outsider.token),
    });
    expect(listRes.status()).toBe(403);

    const restoreRes = await request.post(
      `/documents/${doc.id}/versions/${v1.complete.versionId}/restore`,
      { headers: auth(outsider.token), data: {} },
    );
    expect(restoreRes.status()).toBe(403);
  });
});
