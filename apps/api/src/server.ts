import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import app from "./app";
import { Hono } from "hono";

import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import * as Anchor from "@keetanetwork/anchor";
import { ValiError } from "valibot";
import { AppError } from "./error";

type ServerLogger = Pick<typeof console, 'log' | 'warn' | 'error' | 'debug' | 'info'>

export interface ApiServerConfig {
	server: {
		prefix?: string;
		port?: number;
		logger?: ServerLogger;
	};

	/**
	 * The Keeta Network configuration
	 */
	keetaNet: {
		/**
		 * The FX anchor account
		 */
		fxAccount: NonNullable<Parameters<typeof Anchor.KeetaNet.UserClient.fromNetwork>[1]>;
		resolverAccount?: InstanceType<typeof Anchor.KeetaNet.lib.Account>;
	}
}

export interface ServerEnv {
	Variables: {
		log?: ServerLogger;
		config: ApiServerConfig;
		userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>;
		fxClient: InstanceType<typeof Anchor.FX.Client>;
	};
}

export function createApp(config: ApiServerConfig): Hono<ServerEnv> {
	// Default values for prefix and port
	const { prefix = "/api" } = config.server;

	const logger = config.server.logger;

	// KeetaNet Setup
	const fxAccount = config.keetaNet.fxAccount;
	const userClient = Anchor.KeetaNet.UserClient.fromNetwork('test', fxAccount);
	const fxClient = new Anchor.FX.Client(
		userClient,
		config.keetaNet.resolverAccount ? ({
			root: config.keetaNet.resolverAccount
		}) : (
			undefined
		)
	);

	logger?.info(`Using FX Anchor account: ${fxAccount.publicKeyString.get()}`);

	// Create a new Hono app
	const honoApp = new Hono<ServerEnv>();

	// Enable CORS for all origins
	honoApp.use(cors({ origin: "*" }));

	// Set the config in the context
	honoApp.use(
		createMiddleware<ServerEnv>(
			async (c, next) => {
				c.set("config", config);
				c.set("log", logger);
				c.set("userClient", userClient);
				c.set("fxClient", fxClient);
				await next();
			}
		)
	);

	// Use the main app
	honoApp.route(prefix, app);

	// Handle not found
	honoApp.notFound((c) => c.json({ ok: false, error: "Not Found" }, 404));

	// Handle errors
	honoApp.onError((err, c) => {
		if (err instanceof ValiError || err instanceof AppError) {
			logger?.debug(`${c.req.method} ${c.req.url} - Error:`, err.message);
			return(c.json(
				{ ok: false, error: err.message ?? "Unknown error occurred" },
				400
			));
		}

		logger?.error(`${c.req.method} ${c.req.url} - Error:`, err);
		return(c.json(
			{ ok: false, error: err.message ?? "Unknown error occurred" },
			500
		));
	});

	return(honoApp);
}

export async function createApiServer(config: ApiServerConfig) {
	// Default value for port
	const { port = 8080 } = config.server;

	// Start the app
	const { server, info }: { server: ServerType; info: AddressInfo } =
		await new Promise(resolve => {
			const serverApp = createApp(config);

			// Start the server
			const createdServer = serve(
				{ fetch: serverApp.fetch, port },
				(info) => resolve({ server: createdServer, info })
			);
		});

	return({ server, info });
}
