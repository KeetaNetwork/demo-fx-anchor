import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import app from "./app";
import { Hono } from "hono";

import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

export interface ApiServerConfig {
	server: {
		prefix?: string;
		port?: number;
	};

	/**
	 * The Keeta Network configuration
	 */
	keetaNet: {
		/**
		 * The FX anchor account
		 */
		seed: string;
		index: number;
	}
}

export interface ServerEnv {
	Variables: {
		config: ApiServerConfig;
		// db: KeetaNetKYCDemoPostgreSQL;
	};
}

export async function createApiServer(config: ApiServerConfig) {
	// Default values for prefix and port
	const { prefix = "/api", port = 3010 } = config.server;

	// Start the app
	const { server, info }: { server: ServerType; info: AddressInfo } =
		await new Promise(resolve => {
			// Create a new Hono app
			const serverApp = new Hono();

			// Enable CORS for all origins
			serverApp.use(cors({ origin: "*" }));

			// Set the config in the context
			serverApp.use(
				createMiddleware<{ Variables: { config: ApiServerConfig }}>(
					async (c, next) => {
						c.set("config", config);
						await next();
					}
				)
			);

			// Create the database middleware
			// serverApp.use(
			// 	createMiddleware<ServerEnv>(async (c, next) => {
			// 		// Connect with the database
			// 		const db = await KeetaNetKYCDemoPostgreSQL.createFromURL(
			// 			config.server.database.url,
			// 			{
			// 				tableName: config.server.database.tableName,
			// 				databaseCert: config.server.database.cert
			// 			}
			// 		);

			// 		// Set the database in the context
			// 		c.set("db", db);

			// 		// Call the next middleware
			// 		await next();

			// 		// Close the database connection
			// 		await db.close();
			// 	})
			// );

			// Use the main app
			serverApp.route(prefix, app);

			// Handle not found
			serverApp.notFound((c) => c.json({ ok: false, error: "Not Found" }, 404));

			// Handle errors
			serverApp.onError((err, c) => {
				console.error(`${c.req.method} ${c.req.url} - Error:`, err);
				return(c.json(
					{ ok: false, error: err.message ?? "Unknown error occurred" },
					500
				));
			});

			// Start the server
			const createdServer = serve(
				{ fetch: serverApp.fetch, port },
				(info) => resolve({ server: createdServer, info })
			);
		});

	return({ server, info });
}
