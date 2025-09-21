// AWS SigV4 signing utilities for Cloudflare R2 (S3-compatible)

export interface R2S3Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const SERVICE = 's3';
const REGION = 'auto';

function toDateTime(now: Date) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const date = `${y}${m}${d}`;
  const amzDate = `${date}T${hh}${mm}${ss}Z`;
  return { date, amzDate };
}

async function hmac(key: ArrayBuffer | string, data: string) {
  const enc = new TextEncoder();
  const cryptoKey = typeof key === 'string'
    ? await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    : await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function getSigningKey(secretAccessKey: string, date: string) {
  const kDate = await hmac('AWS4' + secretAccessKey, date);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

async function sha256Hex(data: string) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildHost(accountId: string): string {
  return `${accountId}.r2.cloudflarestorage.com`;
}

function buildPath(bucket: string, key: string): string {
  // R2 uses path-style addressing
  const safeKey = key.split('/').map(encodeURIComponent).join('/');
  return `/${encodeURIComponent(bucket)}/${safeKey}`;
}

function canonicalQuery(params: Record<string, string | number | undefined | null>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [encodeURIComponent(k), v === '' ? '' : encodeURIComponent(String(v))] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return pairs.map(([k, v]) => `${k}=${v ?? ''}`).join('&');
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function presignUrl(
  creds: R2S3Credentials,
  opts: {
    method: 'GET' | 'PUT' | 'POST' | 'DELETE';
    bucket: string;
    key: string;
    expiresSeconds: number; // <= 604800
    subresource?: Record<string, string | number | undefined>;
    extraHeaders?: Record<string, string>;
  }
): Promise<string> {
  const { accountId, accessKeyId, secretAccessKey } = creds;
  const host = buildHost(accountId);
  const { date, amzDate } = toDateTime(new Date());
  const path = buildPath(opts.bucket, opts.key);

  const credential = `${accessKeyId}/${date}/${REGION}/${SERVICE}/aws4_request`;
  const qsBase: Record<string, string | number> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': Math.min(604800, Math.max(1, Math.floor(opts.expiresSeconds))),
    'X-Amz-SignedHeaders': 'host',
  };
  const qsAll = { ...qsBase, ...(opts.subresource || {}) } as Record<string, string | number | ''>;
  const qsCanonical = canonicalQuery(qsAll);

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    opts.method,
    path,
    qsCanonical,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(secretAccessKey, date);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const base = `https://${host}${path}`;
  const sep = qsCanonical.length ? '&' : '';
  const finalQs = qsCanonical + `${sep}X-Amz-Signature=${signature}`;
  return `${base}?${finalQs}`;
}

export async function createMultipartUpload(creds: R2S3Credentials, bucket: string, key: string, contentType?: string) {
  // Server-side: use header-signed request for CreateMultipartUpload to avoid presign quirks
  const host = buildHost(creds.accountId);
  const { date, amzDate } = toDateTime(new Date());
  const path = buildPath(bucket, key);

  const qs = canonicalQuery({ uploads: '' });
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalHeaders = `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'POST',
    path,
    qs,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSigningKey(creds.secretAccessKey, date);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const credential = `${creds.accessKeyId}/${date}/${REGION}/${SERVICE}/aws4_request`;
  const authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}?${qs}`;
  const headers: Record<string, string> = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'authorization': authorization,
  };
  if (contentType) headers['content-type'] = contentType;

  const res = await fetch(url, { method: 'POST', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CreateMultipartUpload failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  // very small XML parser to extract <UploadId>...</UploadId>
  const m = /<UploadId>([^<]+)<\/UploadId>/.exec(text);
  if (!m) throw new Error('UploadId not found');
  return m[1];
}

export function buildUploadPartUrl(creds: R2S3Credentials, bucket: string, key: string, uploadId: string, partNumber: number, expiresSeconds: number) {
  return presignUrl(creds, {
    method: 'PUT',
    bucket,
    key,
    expiresSeconds,
    subresource: { partNumber, uploadId },
  });
}

export async function completeMultipartUpload(
  creds: R2S3Credentials,
  bucket: string,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>
) {
  const host = buildHost(creds.accountId);
  const { date, amzDate } = toDateTime(new Date());
  const path = buildPath(bucket, key);
  const qs = canonicalQuery({ uploadId });
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalHeaders = `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'POST',
    path,
    qs,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSigningKey(creds.secretAccessKey, date);
  const signature = toHex(await hmac(signingKey, stringToSign));
  const credential = `${creds.accessKeyId}/${date}/${REGION}/${SERVICE}/aws4_request`;
  const authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}?${qs}`;
  const headers: Record<string, string> = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'authorization': authorization,
    'content-type': 'application/xml',
  };
  const body = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`CompleteMultipartUpload failed: ${res.status}`);
  return await res.text();
}

export async function signUploadPartHeaders(
  creds: R2S3Credentials,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
) {
  const host = buildHost(creds.accountId);
  const { date, amzDate } = toDateTime(new Date());
  const path = buildPath(bucket, key);
  const qs = canonicalQuery({ partNumber, uploadId });

  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalHeaders = `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    path,
    qs,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = await getSigningKey(creds.secretAccessKey, date);
  const signature = toHex(await hmac(signingKey, stringToSign));
  const credential = `${creds.accessKeyId}/${date}/${REGION}/${SERVICE}/aws4_request`;
  const authorization = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${path}?${qs}`;
  const headers: Record<string, string> = {
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'authorization': authorization,
  };
  return { url, headers };
}


