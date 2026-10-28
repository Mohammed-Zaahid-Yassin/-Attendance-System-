const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectCommand,
  HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const env = require('./env');

const s3 = new S3Client({
  forcePathStyle: true, // Required for Neon Object Storage
  endpoint: env.AWS_ENDPOINT_URL_S3,
  region: env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || ''
  }
});

const BUCKET = env.BUCKET_NAME || 'assets';

/**
 * Upload an asset to Neon Object Storage
 */
async function uploadAsset({ key, body, contentType = 'application/octet-stream', cacheControl = 'public, max-age=3600' }) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl
  });
  const res = await s3.send(command);
  return {
    success: true,
    key,
    bucket: BUCKET,
    etag: res.ETag
  };
}

/**
 * Download an asset from Neon Object Storage
 */
async function getAsset({ key }) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key
  });
  const res = await s3.send(command);
  const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const body = await streamToBuffer(res.Body);
  return {
    key,
    bucket: BUCKET,
    contentType: res.ContentType,
    contentLength: res.ContentLength,
    body
  };
}

/**
 * List assets in Neon Object Storage
 */
async function listAssets({ prefix = '', maxKeys = 100 } = {}) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
    MaxKeys: maxKeys
  });
  const res = await s3.send(command);
  return {
    bucket: BUCKET,
    count: res.KeyCount || 0,
    prefix,
    objects: (res.Contents || []).map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      etag: obj.ETag
    }))
  };
}

/**
 * Delete an asset from Neon Object Storage
 */
async function deleteAsset({ key }) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key
  });
  await s3.send(command);
  return { success: true, key, bucket: BUCKET };
}

/**
 * Generate a presigned download URL
 */
async function getPresignedAssetUrl({ key, expiresInSeconds = 3600 }) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key
  });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return {
    key,
    bucket: BUCKET,
    url,
    expiresInSeconds
  };
}

/**
 * Auto-archive an exported attendance report into Neon Object Storage
 */
async function archiveAttendanceExport({ sessionId, filename, data, contentType }) {
  try {
    const key = `reports/session_${sessionId}/${filename}`;
    const res = await uploadAsset({
      key,
      body: data,
      contentType
    });
    console.log(`[Neon Object Storage] Archived attendance export to ${key}`);
    return res;
  } catch (err) {
    console.warn(`[Neon Object Storage] Warning: Failed to archive export: ${err.message}`);
    return null;
  }
}

module.exports = {
  s3,
  BUCKET,
  uploadAsset,
  getAsset,
  listAssets,
  deleteAsset,
  getPresignedAssetUrl,
  archiveAttendanceExport
};
