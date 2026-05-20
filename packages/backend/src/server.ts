import Fastify from "fastify"
import cors from "@fastify/cors"
import websocket from "@fastify/websocket"

const HOST = process.env.HOST ?? "0.0.0.0"
const PORT = Number(process.env.PORT ?? 8787)

async function buildServer() {
	const app = Fastify({ logger: true })

	await app.register(cors, {
		// During local development the frontend runs on Vite's port (5173).
		// In production it'll be on replay.baro.rs; we accept all origins for
		// now since there is no auth and every replay is public-by-link anyway.
		origin: true,
	})
	await app.register(websocket)

	app.get("/health", async () => ({
		status: "ok",
		service: "mozaik-replay-backend",
		mozaik: "3.10.1",
	}))

	// Stubs — wired up properly in the next pass when the replay engine lands.
	app.post("/api/runs", async (_request, reply) => {
		reply.code(501)
		return { error: "not_implemented", message: "Upload pipeline coming next" }
	})

	app.get("/api/runs/:id", async (request, reply) => {
		const { id } = request.params as { id: string }
		reply.code(404)
		return { error: "not_found", id }
	})

	app.get("/api/runs/:id/stream", { websocket: true }, (socket) => {
		socket.send(
			JSON.stringify({
				kind: "error",
				message: "Replay stream not implemented yet",
			}),
		)
		socket.close()
	})

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
