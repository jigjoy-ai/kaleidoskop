import { randomBytes } from "crypto"
import { readFile } from "fs/promises"
import { homedir } from "os"
import { join } from "path"

import Fastify, { type FastifyRequest } from "fastify"
import cors from "@fastify/cors"
import websocket from "@fastify/websocket"
import type { WebSocket } from "ws"
import type {
	StreamCommand,
	StreamMessage,
} from "@mozaik-replay/shared"

import { parseAuditLogString } from "./audit-log/parser.js"
import { ReplaySession } from "./replay/engine.js"
import { createStorageFromEnv, type RunMeta, type RunStorage } from "./storage/index.js"

const HOST = process.env["HOST"] ?? "0.0.0.0"
const PORT = Number(process.env["PORT"] ?? 8787)

/**
 * Hardcoded sample run accessible via the magic id `smoke-test`. Kept
 * so dev work and the deployed demo page can always fall back to a
 * known-good replay without uploading anything. Set MOZAIK_REPLAY_SAMPLE
 * to point at a different local JSONL.
 */
const SAMPLE_LOG_PATH =
	process.env["MOZAIK_REPLAY_SAMPLE"] ??
	join(homedir(), ".baro", "runs", "baro-1778482053.jsonl")

/** Max accepted upload size for POST /api/runs. 50 MB covers a ~33-story run with headroom. */
const UPLOAD_BODY_LIMIT_BYTES = 50 * 1024 * 1024

function generateRunId(): string {
	// 9 base64url bytes = 12 URL-safe chars (no padding). Plenty of
	// entropy for the foreseeable run population, short enough to fit
	// a shareable replay.baro.rs/r/<id> link.
	return `r_${randomBytes(9).toString("base64url")}`
}

async function buildServer() {
	const app = Fastify({ logger: true, bodyLimit: UPLOAD_BODY_LIMIT_BYTES })
	await app.register(cors, { origin: true })
	await app.register(websocket)

	const storage = createStorageFromEnv()
	app.log.info(
		{ storageImpl: storage.constructor.name },
		"storage backend initialised",
	)

	// JSONL uploads come as text — register a parser so the Body is the
	// raw string rather than Fastify rejecting unknown content-types.
	app.addContentTypeParser(
		["application/jsonl", "application/x-ndjson", "text/plain"],
		{ parseAs: "string", bodyLimit: UPLOAD_BODY_LIMIT_BYTES },
		(_req, body, done) => done(null, body),
	)

	app.get("/health", async () => ({
		status: "ok",
		service: "mozaik-replay-backend",
		mozaik: "3.10.2",
		storage: storage.constructor.name,
		sampleLog: SAMPLE_LOG_PATH,
	}))

	app.post<{ Body: string }>(
		"/api/runs",
		{ bodyLimit: UPLOAD_BODY_LIMIT_BYTES },
		async (request, reply) => {
			const content = request.body
			if (typeof content !== "string" || content.length === 0) {
				reply.code(400)
				return {
					error: "bad_request",
					message:
						"Body must be JSONL text (one audit-log line per row). " +
						"Set Content-Type to application/jsonl or text/plain.",
				}
			}

			// Validate by parsing — also gives us the meta to persist
			// alongside without re-reading the file on every GET.
			let parsed
			try {
				parsed = parseAuditLogString(content)
			} catch (err) {
				reply.code(400)
				return {
					error: "parse_failed",
					message: (err as Error).message,
				}
			}
			if (parsed.events.length === 0) {
				reply.code(400)
				return {
					error: "empty_run",
					message: "No parseable audit-log events found in upload.",
				}
			}

			const id = generateRunId()
			const meta: RunMeta = {
				id,
				createdAt: parsed.startedAt,
				durationMs: parsed.durationMs,
				participantCount: parsed.participants.length,
				storyCount: parsed.participants.filter((p) => p.role === "story")
					.length,
				eventCount: parsed.events.length,
				sizeBytes: Buffer.byteLength(content, "utf8"),
				uploadedAt: new Date().toISOString(),
			}

			try {
				await storage.put(id, content, meta)
			} catch (err) {
				app.log.error(err, "storage put failed")
				reply.code(502)
				return {
					error: "storage_failed",
					message:
						"Persisted parse but failed to write to storage. " +
						"Check S3 bucket permissions / disk space.",
				}
			}

			return { id, meta }
		},
	)

	app.get(
		"/api/runs/:id",
		async (
			request: FastifyRequest<{ Params: { id: string } }>,
			reply,
		) => {
			const { id } = request.params
			if (id === "smoke-test") {
				const parsed = await parseAuditLogString(
					await readFile(SAMPLE_LOG_PATH, "utf8"),
				)
				return {
					id,
					createdAt: parsed.startedAt,
					durationMs: parsed.durationMs,
					participantCount: parsed.participants.length,
					storyCount: parsed.participants.filter((p) => p.role === "story")
						.length,
					eventCount: parsed.events.length,
					source: SAMPLE_LOG_PATH,
				}
			}
			const meta = await storage.getMeta(id)
			if (!meta) {
				reply.code(404)
				return { error: "not_found", message: `Run ${id} not found.` }
			}
			return meta
		},
	)

	app.get(
		"/api/runs/:id/stream",
		{ websocket: true },
		async (
			socket: WebSocket,
			request: FastifyRequest<{ Params: { id: string } }>,
		) => {
			const { id } = request.params
			let session: ReplaySession | null = null

			const send = (msg: StreamMessage) => {
				if (socket.readyState === socket.OPEN) {
					socket.send(JSON.stringify(msg))
				}
			}

			try {
				const { parsed, source } = await loadRun(id, storage)
				app.log.info(
					{
						runId: id,
						source,
						events: parsed.events.length,
						participants: parsed.participants.length,
						durationMs: parsed.durationMs,
					},
					"replay session starting",
				)

				session = new ReplaySession({
					participants: parsed.participants,
					events: parsed.events,
					durationMs: parsed.durationMs,
					sink: send,
					speed: 10,
				})
				session.sendHello(id, parsed.startedAt, parsed.durationMs)
				session.play()
			} catch (err) {
				const message = (err as Error).message
				app.log.error({ err, runId: id }, "replay session failed to start")
				send({ kind: "error", message })
				socket.close()
				return
			}

			socket.on("message", (raw: Buffer) => {
				let cmd: StreamCommand
				try {
					cmd = JSON.parse(raw.toString()) as StreamCommand
				} catch {
					return
				}
				session?.applyCommand(cmd)
			})

			socket.on("close", () => {
				app.log.info({ runId: id }, "replay session client disconnected")
				session?.stop()
				session = null
			})
		},
	)

	return app
}

/**
 * Load a run from either the hardcoded sample (id `smoke-test`) or the
 * configured storage backend. Returns parsed events + the source label
 * used in logs.
 */
async function loadRun(id: string, storage: RunStorage) {
	if (id === "smoke-test") {
		const content = await readFile(SAMPLE_LOG_PATH, "utf8")
		return { parsed: parseAuditLogString(content), source: SAMPLE_LOG_PATH }
	}
	if (!(await storage.exists(id))) {
		throw new Error(`Run ${id} not found in storage`)
	}
	const content = await storage.get(id)
	return { parsed: parseAuditLogString(content), source: `storage:${id}` }
}

async function main() {
	const app = await buildServer()
	try {
		await app.listen({ host: HOST, port: PORT })
		app.log.info({ host: HOST, port: PORT }, "mozaik-replay-backend listening")
	} catch (err) {
		app.log.error(err)
		process.exit(1)
	}
}

void main()
