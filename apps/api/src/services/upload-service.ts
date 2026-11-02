import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { errors } from '../domain/errors.js';
import type { Principal } from '../domain/types.js';
import type { StorageAdapter } from '../adapters/storage/contract.js';
import { requireScope } from './batch-service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'text/plain': ['.txt'],
  'application/octet-stream': ['.psd', '.enc'],
};

export class UploadService {
  constructor(private readonly storage: StorageAdapter) {}

  async presign(
    principal: Principal,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      purpose: 'document' | 'attachment' | 'backup';
    },
  ) {
    requireScope(principal, 'uploads:write');
    if (input.sizeBytes < 1 || input.sizeBytes > MAX_UPLOAD_BYTES)
      throw errors.badRequest('Arquivo fora do limite de 20 MiB.');
    if (
      input.fileName.length > 180 ||
      input.fileName.includes('/') ||
      input.fileName.includes('\\') ||
      input.fileName.includes('\0')
    )
      throw errors.badRequest('Nome de arquivo inválido.');
    const extension = extname(input.fileName).toLowerCase();
    const allowedExtensions = MIME_EXTENSIONS[input.mimeType];
    if (!allowedExtensions?.includes(extension))
      throw errors.badRequest('Tipo MIME ou extensão não permitido.');
    const key = `clinics/${principal.clinicId}/${input.purpose}/${randomUUID()}${extension}`;
    return this.storage.createUploadUrl({
      key,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 300,
    });
  }
}
