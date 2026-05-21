import { randomBytes } from "crypto"
import { readFile } from "fs/promises"
import { homedir } from "os"
import { join, resolve } from "path"

import Fastify, { type FastifyRequest } from "fastify"
import cors from "@fastify/cors"
import staticPlugin from "@fastify/static"
import websocket from "@fastify/websocket"
import type { WebSocket } from "ws"
import type {
	StreamCommand,
	StreamMessage,
} from "@mozaik-replay/shared"

import { parseAuditLogString } from "./audit-log/parser.js"
import { injectOgMeta } from "./og.js"
import { renderOgImage } from "./og-image.js"
import { ReplaySession } from "./replay/engine.js"
import { createStorageFromEnv, type RunMeta, type RunStorage } from "./storage/index.js"

const HOST = process.env["HOST"] ?? "0.0.0.0"
const PORT = Number(process.env["PORT"] ?? 8787)

/**
 * Path to the built frontend's `dist/` (containing index.html + assets/).
 * When set, the backend serves the SPA AND injects per-run OG metadata
 * for `/r/:id` so social-platform link previews show meaningful titles.
 * Leave unset in local dev where Vite serves the SPA on :5173.
 */
const FRONTEND_DIST = process.env["MOZAIK_REPLAY_FRONTEND_DIST"]

/**
 * Public origin used for OG `og:url` and `og:image` absolute URLs.
 * Defaults to "" which lets the meta tags use relative paths — works
 * for direct page loads but social crawlers prefer absolute URLs.
 * Set in production: `MOZAIK_REPLAY_PUBLIC_ORIGIN=https://replay.baro.rs`.
 */
const PUBLIC_ORIGIN = process.env["MOZAIK_REPLAY_PUBLIC_ORIGIN"] ?? ""

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
		{ storageImpl: storage.constructor.name, frontendDist: FRONTEND_DIST ?? null },
		"backend initialised",
	)

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
		frontendDist: FRONTEND_DIST ?? null,
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

			let parsed
			try {
				parsed = parseAuditLogString(content)
			} catch (err) {
				reply.code(400)
				return { error: "parse_failed", message: (err as Error).message }
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
			if (id === "smoke-test") return getSmokeTestMeta(id)
			const meta = await storage.getMeta(id)
			if (!meta) {
				reply.code(404)
				return { error: "not_found", message: `Run ${id} not found.` }
			}
			return meta
		},
	)

	app.get<{ Params: { id: string } }>(
		"/api/runs/:id/og.svg",
		async (request, reply) => {
			const { id } = request.params
			try {
				const { parsed, meta } = await loadRunWithMeta(id, storage)
				const svg = renderOgImage(meta, parsed)
				reply
					.type("image/svg+xml; charset=utf-8")
					.header("cache-control", "public, max-age=3600")
					.send(svg)
			} catch (err) {
				reply.code(404).send({
					error: "not_found",
					message: (err as Error).message,
				})
			}
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

	// ------------------------------------------------------------------
	// SPA + OG SSR. Active only when MOZAIK_REPLAY_FRONTEND_DIST is set
	// (i.e. production). Dev: Vite serves index.html on :5173 and we
	// don't get OG injection there.
	// ------------------------------------------------------------------
	if (FRONTEND_DIST) {
		const distRoot = resolve(FRONTEND_DIST)
		await app.register(staticPlugin, {
			root: distRoot,
			prefix: "/",
			wildcard: false,
			decorateReply: false,
		})

		// Cache the index.html template at boot so /r/:id doesn't pay a
		// disk read per request.
		const indexTemplate = await readFile(join(distRoot, "index.html"), "utf8")

		app.get<{ Params: { id: string } }>(
			"/r/:id",
			async (request, reply) => {
				const { id } = request.params
				let meta: RunMeta | null
				if (id === "smoke-test") {
					const m = await getSmokeTestMeta(id)
					meta = "error" in m ? null : m
				} else {
					meta = await storage.getMeta(id)
				}
				const html = injectOgMeta(indexTemplate, {
					runId: id,
					publicOrigin: PUBLIC_ORIGIN,
					meta,
				})
				reply.type("text/html; charset=utf-8").send(html)
			},
		)

		// SPA root fallback — fastify-static already serves index.html on
		// "/", but having an explicit handler keeps the OG block clean.
		// Any other unmatched path falls through to fastify-static's 404.
		app.setNotFoundHandler((_req, reply) => {
			reply.type("text/html; charset=utf-8").send(indexTemplate)
		})
	}

	return app

	async function getSmokeTestMeta(
		id: string,
	): Promise<RunMeta | { error: string; message: string }> {
		try {
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
				sizeBytes: 0,
				uploadedAt: parsed.startedAt,
			}
		} catch (err) {
			return { error: "smoke_unavailable", message: (err as Error).message }
		}
	}
}

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

async function loadRunWithMeta(id: string, storage: RunStorage) {
	const { parsed } = await loadRun(id, storage)
	const meta: RunMeta =
		id === "smoke-test"
			? {
					id,
					createdAt: parsed.startedAt,
					durationMs: parsed.durationMs,
					participantCount: parsed.participants.length,
					storyCount: parsed.participants.filter((p) => p.role === "story")
						.length,
					eventCount: parsed.events.length,
					sizeBytes: 0,
					uploadedAt: parsed.startedAt,
				}
			: ((await storage.getMeta(id)) ?? (() => {
					throw new Error(`Run ${id} meta missing`)
				})())
	return { parsed, meta }
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
