import {
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import type { Readable } from "stream"
import type { RunMeta, RunStorage } from "./types.js"

/**
 * S3-backed storage. Each run lives at two keys under `keyPrefix`:
 *   <keyPrefix><id>.jsonl       — raw audit-log content
 *   <keyPrefix><id>.meta.json   — RunMeta as JSON
 *
 * Authentication is delegated to the AWS SDK's default credential chain:
 * env vars → shared config → IAM role on EC2/ECS/Fargate. We never read
 * AWS_ACCESS_KEY_ID directly — passing it explicitly would break the
 * IAM-role path on production EC2.
 */
export class S3RunStorage implements RunStorage {
	private readonly client: S3Client

	constructor(
		private readonly bucket: string,
		region: string | undefined,
		private readonly keyPrefix: string = "runs/",
	) {
		this.client = new S3Client({ region })
	}

	private contentKey(id: string): string {
		return `${this.keyPrefix}${id}.jsonl`
	}

	private metaKey(id: string): string {
		return `${this.keyPrefix}${id}.meta.json`
	}

	async put(id: string, content: string, meta: RunMeta): Promise<void> {
		// Write content first; meta is the "this run is finalised" marker.
		// A partial failure leaves orphaned content (cheaper to GC than
		// the reverse, where meta points at missing content).
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.contentKey(id),
				Body: content,
				ContentType: "application/jsonl",
			}),
		)
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.metaKey(id),
				Body: JSON.stringify(meta, null, 2),
				ContentType: "application/json",
			}),
		)
	}

	async get(id: string): Promise<string> {
		const res = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: this.contentKey(id),
			}),
		)
		if (!res.Body) throw new Error(`S3 object ${this.contentKey(id)} has no body`)
		return streamToString(res.Body as Readable)
	}

	async getMeta(id: string): Promise<RunMeta | null> {
		try {
			const res = await this.client.send(
				new GetObjectCommand({
					Bucket: this.bucket,
					Key: this.metaKey(id),
				}),
			)
			if (!res.Body) return null
			const raw = await streamToString(res.Body as Readable)
			return JSON.parse(raw) as RunMeta
		} catch (err) {
			if (isNotFoundError(err)) return null
			throw err
		}
	}

	async exists(id: string): Promise<boolean> {
		// Meta is the "this run is finalised" marker — checking it is
		// enough. We don't double-HEAD the content key because the
		// invariant from put() guarantees content exists when meta does.
		try {
			await this.client.send(
				new HeadObjectCommand({
					Bucket: this.bucket,
					Key: this.metaKey(id),
				}),
			)
			return true
		} catch (err) {
			if (isNotFoundError(err)) return false
			throw err
		}
	}
}

async function streamToString(stream: Readable): Promise<string> {
	const chunks: Buffer[] = []
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
	}
	return Buffer.concat(chunks).toString("utf8")
}

function isNotFoundError(err: unknown): boolean {
	const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
	return (
		e?.name === "NotFound" ||
		e?.name === "NoSuchKey" ||
		e?.$metadata?.httpStatusCode === 404
	)
}
