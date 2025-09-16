import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import ora from 'ora';
import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

interface UploadOptions {
  version?: string;
  filePath?: string;
  bucket?: string;
  prefix?: string;
  partSizeMb?: number;
  concurrency?: number;
  pruneOld?: boolean;
}

interface UploadResult {
  key: string;
  etag?: string;
}

function loadEnv() {
  // Load root .env
  const envPath = path.join(process.cwd(), '.env');
  dotenv.config({ path: envPath });
}

function resolveVersion(cliVersion?: string): string {
  if (cliVersion && cliVersion.trim()) return cliVersion.trim();
  // Try npm_package_version (available in scripts)
  if (process.env.npm_package_version) return process.env.npm_package_version;
  // Read from package.json as fallback
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
  if (!pkg.version) throw new Error('Could not determine app version. Pass --version X.Y.Y or set npm_package_version.');
  return pkg.version;
}

function expectedMsiPath(version: string): string {
  const releaseDir = path.join(process.cwd(), 'release', version);
  const expected = path.join(releaseDir, `CryptoVertX-MSI-Installer-v${version}.msi`);
  if (fs.existsSync(expected)) return expected;
  // Fallback: find any .msi in the release dir
  if (fs.existsSync(releaseDir)) {
    const candidates = fs.readdirSync(releaseDir).filter(f => f.toLowerCase().endsWith('.msi'));
    if (candidates.length > 0) {
      return path.join(releaseDir, candidates[0]);
    }
  }
  throw new Error(`MSI file not found in release/${version}. Expected ${path.basename(expected)}.`);
}

function resolveBucket(): string {
  // Support both R2_BUCKET and R2_BUCKET_NAME
  const value = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'cryptoconverter-downloads';
  if (!value) throw new Error('R2 bucket not specified. Set R2_BUCKET or R2_BUCKET_NAME in .env');
  return value;
}

function resolvePrefix(): string {
  const prefix = process.env.R2_PREFIX || 'latest/';
  // Normalize to ensure trailing slash
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function resolveEndpoint(): string {
  const fromEnv = process.env.R2_ENDPOINT;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is required to build the R2 endpoint if R2_ENDPOINT is not set.');
  return `https://${account}.r2.cloudflarestorage.com`;
}

function createR2Client(): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required for uploads.');
  }
  const endpoint = resolveEndpoint();
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function bytesToHuman(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
}

function getShouldPrune(pruneOld?: boolean): boolean {
  // Default ON; allow disabling via env R2_KEEP_ONLY_LATEST=false
  if (typeof pruneOld === 'boolean') return pruneOld;
  const envValue = (process.env.R2_KEEP_ONLY_LATEST || 'true').toLowerCase();
  return envValue !== 'false' && envValue !== '0';
}

async function prunePrefixKeepOnlyLatest(client: S3Client, bucket: string, prefix: string, keepKey: string): Promise<number> {
  const spinner = ora({ text: pc.blue('Pruning old artifacts in prefix...'), color: 'cyan' }).start();
  let deletedCount = 0;
  try {
    let continuationToken: string | undefined = undefined;
    const keysToDelete: string[] = [];

    while (true) {
      const listResp = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
      const contents = listResp.Contents || [];
      for (const obj of contents) {
        const key = obj.Key || '';
        if (!key || key === keepKey) continue;
        keysToDelete.push(key);
      }
      if (!listResp.IsTruncated) break;
      continuationToken = listResp.NextContinuationToken;
    }

    if (keysToDelete.length === 0) {
      spinner.succeed(pc.green('No old artifacts to prune.'));
      return 0;
    }

    // Batch delete up to 1000 at once
    const deleteResp = await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keysToDelete.map(k => ({ Key: k })) }
    }));

    deletedCount = deleteResp.Deleted?.length || keysToDelete.length;
    spinner.succeed(pc.green(`Pruned ${deletedCount} old object(s).`));
    return deletedCount;
  } catch (err) {
    spinner.fail(pc.red('Failed to prune old artifacts.'));
    console.error(pc.dim(String(err instanceof Error ? err.message : err)));
    return deletedCount;
  }
}

export async function uploadReleaseArtifact(options: UploadOptions = {}): Promise<UploadResult> {
  loadEnv();

  const version = resolveVersion(options.version);
  const filePath = options.filePath || expectedMsiPath(version);
  const bucket = options.bucket || resolveBucket();
  const prefix = options.prefix || resolvePrefix();
  const key = `${prefix}${path.basename(filePath)}`;
  const partSize = (options.partSizeMb ?? 64) * 1024 * 1024; // 64 MiB default
  const concurrency = options.concurrency ?? 4; // 3–4 recommended; use 4
  const shouldPrune = getShouldPrune(options.pruneOld);

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`);

  console.log(pc.cyan(`\n📤 Preparing upload to Cloudflare R2`));
  console.log(pc.dim('━'.repeat(60)));
  console.log(`${pc.blue('File:    ')}${path.basename(filePath)} (${bytesToHuman(stat.size)})`);
  console.log(`${pc.blue('Bucket:  ')}${bucket}`);
  console.log(`${pc.blue('Key:     ')}${key}`);
  console.log(`${pc.blue('Part:    ')}${(partSize / (1024 * 1024)).toFixed(0)} MiB × parallel ${concurrency}`);

  const client = createR2Client();
  const spinner = ora({ text: pc.blue('Initializing multipart upload...'), color: 'cyan' }).start();

  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: 'application/x-msi'
      },
      queueSize: concurrency,
      partSize,
      leavePartsOnError: false
    });

    let lastLogged = Date.now();
    upload.on('httpUploadProgress', (progress: any) => {
      const loaded = progress.loaded ?? 0;
      const total = progress.total ?? stat.size; // lib-storage may not always set total
      const pct = Math.min(100, Math.floor((loaded / total) * 100));
      const now = Date.now();
      if (now - lastLogged > 250) {
        spinner.text = pc.blue(`Uploading... ${pct}% (${bytesToHuman(loaded)} / ${bytesToHuman(total)})`);
        lastLogged = now;
      }
    });

    const result: any = await upload.done();
    spinner.succeed(pc.green('Upload complete'));

    console.log(pc.green(`✅ Uploaded to s3://${bucket}/${key}`));
    if (result && result.ETag) {
      console.log(pc.dim(`ETag: ${result.ETag}`));
    }

    if (shouldPrune) {
      await prunePrefixKeepOnlyLatest(client, bucket, prefix, key);
    } else {
      console.log(pc.yellow('Skipping prune step (R2_KEEP_ONLY_LATEST is false).'));
    }

    return { key, etag: result?.ETag };
  } catch (error) {
    spinner.fail(pc.red('Upload failed'));
    const message = (error instanceof Error ? error.message : String(error));
    console.error(pc.red(`❌ ${message}`));
    throw error;
  }
}

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function runCli() {
  // Simple CLI interface
  const version = parseArg('--version');
  const file = parseArg('--file');
  const prefix = parseArg('--prefix');
  const bucket = parseArg('--bucket');
  const partSizeMb = parseArg('--part-size-mb');
  const concurrency = parseArg('--concurrency');

  await uploadReleaseArtifact({
    version,
    filePath: file,
    prefix,
    bucket,
    partSizeMb: partSizeMb ? Number(partSizeMb) : undefined,
    concurrency: concurrency ? Number(concurrency) : undefined
  });
}

// Execute when run directly
if (require.main === module) {
  runCli().catch((err) => {
    process.exitCode = 1;
  });
}
