import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3-compatible storage (AWS S3, MinIO, ...). Serving = 302 redirect to a short-lived presigned GET URL,
 * so video bytes (and Range requests) go straight from the object store to the browser.
 * @param {{ endpoint?: string, region?: string, bucket: string, accessKeyId?: string, secretAccessKey?: string,
 *   forcePathStyle?: boolean, urlTtlSeconds?: number }} o
 */
export function createS3Storage(o) {
  const s3 = new S3Client({
    region: o.region || 'us-east-1',
    endpoint: o.endpoint,
    forcePathStyle: o.forcePathStyle ?? !!o.endpoint,
    credentials: o.accessKeyId ? { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey || '' } : undefined,
  });
  return {
    driver: 's3',
    /** @param {string} key */
    async presign(key) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: o.bucket, Key: key }), { expiresIn: o.urlTtlSeconds ?? 3600 });
    },
    async serve(_req, res, key) {
      res.set('Cache-Control', 'private, no-store');
      res.redirect(302, await this.presign(key));
    },
  };
}
