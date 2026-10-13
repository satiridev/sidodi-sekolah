import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import * as path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Abstraksi storage: S3-compatible (region Indonesia) bila env tersedia,
 * jika tidak fallback ke disk lokal (.storage/) untuk pengembangan.
 */
@Injectable()
export class StorageService {
  private readonly localDir = path.join(process.cwd(), '.storage');
  private readonly s3?: S3Client;
  private readonly bucket?: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const endpoint = process.env.S3_ENDPOINT;
    if (bucket && endpoint) {
      this.bucket = bucket;
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? 'ap-southeast-3',
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
      });
    }
  }

  get isRemote(): boolean {
    return Boolean(this.s3);
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  buildKey(schoolId: string, hash: string, ext: string): string {
    return `${schoolId}/${hash}${ext ? `.${ext}` : ''}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    const abs = this.localPath(key);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }

  async presignedGet(key: string, expiresIn = 900): Promise<string> {
    if (this.s3 && this.bucket) {
      return getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn },
      );
    }
    return `/api/v1/files?key=${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    if (this.s3 && this.bucket) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return;
    }
    const abs = this.localPath(key);
    if (existsSync(abs)) rmSync(abs, { force: true });
  }

  localPath(key: string): string {
    const base = path.resolve(this.localDir);
    const abs = path.resolve(base, key);
    // Cegah path traversal (mis. key berisi ../../).
    if (abs !== base && !abs.startsWith(base + path.sep)) {
      throw new BadRequestException('Key penyimpanan tidak valid');
    }
    return abs;
  }

  localExists(key: string): boolean {
    return existsSync(this.localPath(key));
  }

  readLocal(key: string): Buffer {
    return readFileSync(this.localPath(key));
  }
}
