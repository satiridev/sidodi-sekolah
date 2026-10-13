import { BadRequestException } from '@nestjs/common';
import {
  BLOCKED_EXTENSIONS,
  LARGE_VIDEO_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  getExtension,
} from '@arsip/shared';

export interface PolicyInput {
  fileName: string;
  sizeBytes: number;
  allowedExtensions?: string[] | null;
  maxSizeBytes?: number | bigint | null;
}

export interface PolicyResult {
  allowed: boolean;
  reasons: string[];
}

const MB = 1024 * 1024;

/** Policy engine: batas ukuran, ekstensi terlarang, dan allowlist jenis dokumen. */
export function validateFilePolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = [];
  const ext = getExtension(input.fileName).toLowerCase();

  const maxSize = Number(input.maxSizeBytes ?? MAX_FILE_SIZE_BYTES);
  if (input.sizeBytes > maxSize) {
    reasons.push(
      `Ukuran file melebihi batas ${Math.round(maxSize / MB)} MB`,
    );
  }

  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
    reasons.push(`Ekstensi .${ext} diblokir`);
  }

  if ((LARGE_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    reasons.push(`Video .${ext} tidak relevan untuk arsip kerja`);
  }

  const allowed = input.allowedExtensions;
  if (allowed && allowed.length > 0 && !allowed.includes(ext)) {
    reasons.push(`Ekstensi .${ext} tidak diizinkan untuk jenis dokumen ini`);
  }

  return { allowed: reasons.length === 0, reasons };
}

export function assertFilePolicy(input: PolicyInput): void {
  const result = validateFilePolicy(input);
  if (!result.allowed) {
    throw new BadRequestException({
      error: 'POLICY_VIOLATION',
      message: result.reasons.join('; '),
      details: result.reasons,
    });
  }
}
