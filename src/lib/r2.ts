// Cloudflare R2 is S3-compatible, so the AWS SDK talks to it directly — the only
// differences are the endpoint and that the region is always "auto".
//
// Not wired into any route yet; Phase 3 (the props pipeline) is its first consumer.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Throws a readable error instead of letting the SDK fail opaquely later. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to .env.local — see .env.example for where to find it.`
    );
  }
  return value;
}

let client: S3Client | undefined;

/** Lazily constructed so importing this module doesn't throw before R2 is configured. */
export function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required("R2_ACCESS_KEY_ID"),
        secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

/**
 * Presigned PUT so the browser uploads straight to R2, never through our server.
 * The bucket's CORS policy must allow PUT from the app origin or this fails
 * with an opaque network error rather than a useful message.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: required("R2_BUCKET"),
    Key: key,
    ContentType: contentType,
    // Assets are content-addressed by key, so they can cache indefinitely.
    CacheControl: "public, max-age=31536000, immutable",
  });
  return getSignedUrl(r2(), command, { expiresIn });
}

/** Public read URL for an uploaded asset. */
export function publicUrl(key: string): string {
  return `${required("NEXT_PUBLIC_R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`;
}
