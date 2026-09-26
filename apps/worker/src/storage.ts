import { gunzipSync, gzipSync } from "node:zlib";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireEnv } from "./env";

/** Object storage for HTML snapshots, crawl snapshots and code uploads. */
export interface BlobStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export class S3BlobStore implements BlobStore {
  private bucketReady: Promise<void> | null = null;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  static fromEnv(): S3BlobStore {
    const client = new S3Client({
      endpoint: requireEnv("S3_ENDPOINT"),
      region: process.env["S3_REGION"] ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
    return new S3BlobStore(client, process.env["S3_BUCKET"] ?? "snapshots");
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    await this.ensureBucket();
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    })();
    return this.bucketReady;
  }
}

export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
  }
  async get(key: string): Promise<Buffer | null> {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** Content-addressed: identical HTML is stored once per organization. */
export const htmlKey = (organizationId: string, hash: string): string =>
  `orgs/${organizationId}/html/${hash}.html.gz`;
export const snapshotKey = (organizationId: string, crawlId: string): string =>
  `orgs/${organizationId}/crawls/${crawlId}/snapshot.json.gz`;
export const uploadKey = (organizationId: string, crawlId: string): string =>
  `orgs/${organizationId}/uploads/${crawlId}.zip`;

export const gzip = (text: string): Buffer => gzipSync(Buffer.from(text, "utf8"));
export const gunzip = (buf: Buffer): string => gunzipSync(buf).toString("utf8");
