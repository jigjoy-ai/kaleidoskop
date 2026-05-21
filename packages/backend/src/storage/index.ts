import { join } from "path"
import { FsRunStorage } from "./fs-storage.js"
import { S3RunStorage } from "./s3-storage.js"
import type { RunStorage } from "./types.js"

export type { RunMeta, RunStorage } from "./types.js"
export { FsRunStorage } from "./fs-storage.js"
export { S3RunStorage } from "./s3-storage.js"

/**
 * Pick the storage backend from environment. Defaults to filesystem so
 * local dev works without any AWS setup. In production set:
 *   MOZAIK_REPLAY_STORAGE=s3
 *   S3_BUCKET=<your bucket>
 *   S3_REGION=<region>             (optional; SDK default chain applies)
 *   S3_KEY_PREFIX=runs/            (optional; default "runs/")
 *
 * AWS credentials are resolved by the SDK's default chain — env vars
 * locally, IAM role on EC2/ECS. Don't hard-code AWS_ACCESS_KEY_ID here.
 */
export function createStorageFromEnv(): RunStorage {
	const mode = (process.env["MOZAIK_REPLAY_STORAGE"] ?? "fs").toLowerCase()
	if (mode === "s3") {
		const bucket = process.env["S3_BUCKET"]
		if (!bucket) {
			throw new Error(
				"MOZAIK_REPLAY_STORAGE=s3 requires S3_BUCKET env var",
			)
		}
		return new S3RunStorage(
			bucket,
			process.env["S3_REGION"],
			process.env["S3_KEY_PREFIX"] ?? "runs/",
		)
	}
	if (mode === "fs") {
		const dir =
			process.env["MOZAIK_REPLAY_STORAGE_DIR"] ??
			join(process.cwd(), "storage", "runs")
		return new FsRunStorage(dir)
	}
	throw new Error(
		`Unknown MOZAIK_REPLAY_STORAGE=${mode}; expected "fs" or "s3"`,
	)
}
