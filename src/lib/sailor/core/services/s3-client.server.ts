/**
 * One place to construct an S3 client.
 *
 * The checksum options are the reason this exists rather than each caller
 * newing up its own. From `@aws-sdk/client-s3` 3.729 both
 * `requestChecksumCalculation` and `responseChecksumValidation` default to
 * `WHEN_SUPPORTED`, which makes the SDK send and then verify CRC32 checksums on
 * every object. S3 itself implements that; several S3-compatible providers do
 * not — Cloudflare R2 most visibly, where `ListObjects` succeeds and
 * `GetObject` then hangs on the body stream rather than failing outright.
 *
 * `WHEN_REQUIRED` restores the pre-3.729 behaviour: checksums are still used
 * where the API demands them, and skipped otherwise.
 *
 * The timeouts matter for the same reason. `DEFAULT_REQUEST_TIMEOUT` in
 * `@smithy/node-http-handler` is 0 — no timeout — so a provider that accepts a
 * request and then stalls on the body leaves the call hanging indefinitely with
 * nothing logged. That is precisely how the checksum incompatibility above
 * presented: not an error, just a download that never finished. A bounded
 * request turns any future stall into a visible failure instead.
 *
 * The client is imported dynamically so the SDK stays out of the main bundle,
 * matching how the callers already did it.
 */

/** Generous enough for large media over a slow link, short enough to surface a stall. */
const REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 5_000;
export interface S3ClientOptions {
  region: string;
  endpoint?: string;
  /** Override the default request timeout, e.g. for very large objects. */
  requestTimeoutMs?: number;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export async function createS3Client(config: S3ClientOptions, credentials: S3Credentials) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: config.region,
    credentials,
    endpoint: config.endpoint,
    // Path style for anything that isn't AWS proper (MinIO, R2, Spaces…).
    forcePathStyle: config.endpoint !== 'https://s3.amazonaws.com',
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      requestTimeout: config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
      connectionTimeout: CONNECTION_TIMEOUT_MS
    }
  });
}
