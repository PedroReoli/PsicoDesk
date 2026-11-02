export interface PresignedUpload {
  key: string;
  url: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}

export interface StorageAdapter {
  createUploadUrl(input: {
    key: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedUpload>;
  createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }>;
}
