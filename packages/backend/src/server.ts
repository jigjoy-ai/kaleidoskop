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

import { parseAuditLog } from "./audit-log/parser.js"
import { ReplaySession } from "./replay/engine.js"

const HOST = process.env.HOST ?? "0.0.0.0"
const PORT = Number(process.env.PORT ?? 8787)

/**
 * For the smoke-test build, the WS endpoint always replays the same
 * hardcoded sample log so we can verify the engine end-to-end without
 * an upload pipeline. Upload + storage land in the next pass; for now
 * this lets the frontend connect and watch a real 3-story run.
 */
const SAMPLE_LOG_PATH =
	process.env.MOZAIK_REPLAY_SAMPLE ??
	join(homedir(), ".baro", "runs", "baro-1778482053.jsonl")

async function buildServer() {
	const app = Fastify({ logger: true })
	await app.register(cors, { origin: true })
	await app.register(websocket)

	app.get("/health", async () => ({
		status: "ok",
		service: "mozaik-replay-backend",
		mozaik: "3.10.2",
		sampleLog: SAMPLE_LOG_PATH,
	}))

	app.post("/api/runs", async (_request, reply) => {
		reply.code(501)
		return {
			error: "not_implemented",
			message:
				"Upload pipeline coming next. The /api/runs/:id/stream endpoint " +
				"currently replays a hardcoded sample log; pass any run id.",
		}
	})

	app.get("/api/runs/:id", async (request, _reply) => {
		const { id } = request.params as { id: string }
		// Always describe the sample for now — the frontend only needs
		// metadata to render the run page header.
		const parsed = await parseAuditLog(SAMPLE_LOG_PATH)
		return {
			id,
			createdAt: parsed.startedAt,
			durationMs: parsed.durationMs,
			participantCount: parsed.participants.length,
			storyCount: parsed.participants.filter((p) => p.role === "story").length,
			eventCount: parsed.events.length,
			source: SAMPLE_LOG_PATH,
		}
	})

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
				const parsed = await parseAuditLog(SAMPLE_LOG_PATH)
				app.log.info(
					{
						sample: SAMPLE_LOG_PATH,
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
				app.log.error(err, "replay session failed to start")
				send({
					kind: "error",
					message: `Failed to load sample log at ${SAMPLE_LOG_PATH}: ${
						(err as Error).message
					}`,
				})
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
				app.log.info("replay session client disconnected")
				session?.stop()
				session = null
			})
		},
	)

	return app
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
