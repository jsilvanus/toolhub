import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';

/**
 * @typedef {{ driver: string, serve(req: any, res: any, key: string): Promise<any> }} Storage
 * @param {NodeJS.ProcessEnv} env
 * @returns {Storage|null}
 */
export function storageFromEnv(env = process.env) {
  const driver = env.STORAGE_DRIVER || 'local';
  if (driver === 'local') return createLocalStorage(env.STORAGE_LOCAL_DIR || './media');
  if (driver === 's3') {
    if (!env.S3_BUCKET) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
    return createS3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE !== 'false' : undefined,
      urlTtlSeconds: env.S3_URL_TTL_SECONDS ? Number(env.S3_URL_TTL_SECONDS) : undefined,
    });
  }
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use local or s3)`);
}
