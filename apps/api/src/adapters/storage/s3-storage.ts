import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { PresignedUpload, StorageAdapter } from './contract.js';

export interface S3StorageConfig {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      requestHandler: new NodeHttpHandler({ requestTimeout: 8_000, connectionTimeout: 3_000 }),
    });
  }

  async createUploadUrl(input: {
    key: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
      ServerSideEncryption: 'AES256',
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    return {
      key: input.key,
      url,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString(),
      requiredHeaders: {
        'content-type': input.mimeType,
        'content-length': String(input.sizeBytes),
        'x-amz-server-side-encryption': 'AES256',
      },
    };
  }

  async createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString() };
  }
}
