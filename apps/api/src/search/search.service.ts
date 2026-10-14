import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';

export interface SearchQuery {
  q: string;
  documentTypeId?: string;
  academicYearId?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface SearchHit {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  visibility: string;
  documentTypeId: string | null;
  documentTypeName: string | null;
  academicYearId: string | null;
  versionId: string | null;
  fileName: string | null;
  extension: string | null;
  sizeBytes: string | null;
  ocrStatus: string | null;
  excerpt: string | null;
  rank: number;
}

export interface SearchFacets {
  documentType: Array<{ id: string; name: string | null; count: number }>;
  academicYear: Array<{ id: string; count: number }>;
  tags: Array<{ value: string; count: number }>;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Pencarian full-text PostgreSQL (`tsvector`) dengan fallback ILIKE untuk
   * pencocokan sebagian, plus facet (jenis dokumen, tahun ajaran, tag).
   * Sesuai spec §4.3.
   */
  async search(schoolId: string, userId: string, query: SearchQuery) {
    await this.access.membership(userId, schoolId);

    const q = (query.q ?? '').trim();
    if (!q) throw new BadRequestException('Parameter q wajib diisi');

    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const like = `%${q}%`;

    const conditions: Prisma.Sql[] = [];
    if (query.documentTypeId) {
      conditions.push(
        Prisma.sql`AND d.document_type_id = ${query.documentTypeId}::uuid`,
      );
    }
    if (query.academicYearId) {
      conditions.push(
        Prisma.sql`AND f.academic_year_id = ${query.academicYearId}::uuid`,
      );
    }
    if (query.tags?.length) {
      conditions.push(
        Prisma.sql`AND d.tags && ARRAY[${Prisma.join(
          query.tags.map((t) => Prisma.sql`${t}`),
        )}]::text[]`,
      );
    }

    const base = Prisma.sql`
      FROM documents d
      JOIN document_versions v ON v.id = d.current_version_id
      LEFT JOIN folders f ON f.id = d.folder_id
      LEFT JOIN document_types dt ON dt.id = d.document_type_id
      CROSS JOIN (SELECT websearch_to_tsquery('indonesian', ${q}) AS query) q
      WHERE d.school_id = ${schoolId}::uuid
        AND d.deleted_at IS NULL
        AND d.purged_at IS NULL
        AND (
          v.search_vector @@ q.query
          OR d.title ILIKE ${like}
          OR coalesce(v.ocr_text, '') ILIKE ${like}
        )
        ${conditions.length ? Prisma.sql`${Prisma.join(conditions, ' ')}` : Prisma.empty}
    `;

    const countRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS total ${base}`,
    );
    const total = Number(countRows[0]?.total ?? 0n);

    const rows = await this.prisma.$queryRaw<SearchHit[]>(Prisma.sql`
      SELECT d.id,
             d.title,
             d.description,
             d.tags,
             d.visibility::text AS visibility,
             d.document_type_id AS "documentTypeId",
             dt.name AS "documentTypeName",
             f.academic_year_id AS "academicYearId",
             v.id AS "versionId",
             v.file_name AS "fileName",
             v.extension,
             v.size_bytes::text AS "sizeBytes",
             v.ocr_status::text AS "ocrStatus",
             LEFT(coalesce(v.ocr_text, ''), 300) AS excerpt,
             ts_rank(v.search_vector, q.query)::float8 AS rank
      ${base}
      ORDER BY rank DESC NULLS LAST, d.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const facetRows = await this.prisma.$queryRaw<
      Array<{
        documentTypeId: string | null;
        documentTypeName: string | null;
        academicYearId: string | null;
        tags: string[];
      }>
    >(Prisma.sql`
      SELECT d.document_type_id AS "documentTypeId",
             dt.name AS "documentTypeName",
             f.academic_year_id AS "academicYearId",
             d.tags
      ${base}
      LIMIT 500
    `);

    return {
      data: rows.map((r) => ({ ...r, rank: Number(r.rank ?? 0) })),
      total,
      page,
      limit,
      facets: this.buildFacets(facetRows),
    };
  }

  private buildFacets(
    rows: Array<{
      documentTypeId: string | null;
      documentTypeName: string | null;
      academicYearId: string | null;
      tags: string[];
    }>,
  ): SearchFacets {
    const types = new Map<
      string,
      { id: string; name: string | null; count: number }
    >();
    const years = new Map<string, number>();
    const tags = new Map<string, number>();

    for (const row of rows) {
      if (row.documentTypeId) {
        const entry = types.get(row.documentTypeId) ?? {
          id: row.documentTypeId,
          name: row.documentTypeName,
          count: 0,
        };
        entry.count += 1;
        types.set(row.documentTypeId, entry);
      }
      if (row.academicYearId) {
        years.set(row.academicYearId, (years.get(row.academicYearId) ?? 0) + 1);
      }
      for (const tag of row.tags ?? []) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }

    const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
      b.count - a.count;

    return {
      documentType: [...types.values()].sort(byCountDesc),
      academicYear: [...years.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort(byCountDesc),
      tags: [...tags.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort(byCountDesc)
        .slice(0, 30),
    };
  }
}
