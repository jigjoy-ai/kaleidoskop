import { mkdir, readFile, writeFile, access } from "fs/promises"
import { join } from "path"
import { constants as fsConstants } from "fs"
import type { RunMeta, RunStorage } from "./types.js"

/**
 * Filesystem-backed storage. Layout under `baseDir`:
 *   <baseDir>/<id>.jsonl       — raw audit-log content
 *   <baseDir>/<id>.meta.json   — RunMeta serialised as JSON
 *
 * Used for local dev (no AWS creds needed) and as a sane default when
 * `MOZAIK_REPLAY_STORAGE` is unset.
 */
export class FsRunStorage implements RunStorage {
	constructor(private readonly baseDir: string) {}

	private contentPath(id: string): string {
		return join(this.baseDir, `${id}.jsonl`)
	}

	private metaPath(id: string): string {
		return join(this.baseDir, `${id}.meta.json`)
	}

	async put(id: string, content: string, meta: RunMeta): Promise<void> {
		await mkdir(this.baseDir, { recursive: true })
		await writeFile(this.contentPath(id), content, "utf8")
		await writeFile(this.metaPath(id), JSON.stringify(meta, null, 2), "utf8")
	}

	async get(id: string): Promise<string> {
		return readFile(this.contentPath(id), "utf8")
	}

	async getMeta(id: string): Promise<RunMeta | null> {
		try {
			const raw = await readFile(this.metaPath(id), "utf8")
			return JSON.parse(raw) as RunMeta
		} catch {
			return null
		}
	}

	async exists(id: string): Promise<boolean> {
		try {
			await Promise.all([
				access(this.contentPath(id), fsConstants.F_OK),
				access(this.metaPath(id), fsConstants.F_OK),
			])
			return true
		} catch {
			return false
		}
	}
}
