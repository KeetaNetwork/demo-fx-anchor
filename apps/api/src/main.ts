import { KeetaNet } from "@keetanetwork/anchor";
import type { ApiServerConfig } from "./server";
import { createApiServer } from "./server";
import { getEnv } from "./utils/config";
import type { LogLevel } from "./utils/logger";
import { Logger } from "./utils/logger";

async function main(): Promise<0 | 1> {

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const logger = new Logger(getEnv('APP_LOG_LEVEL', 'WARN') as LogLevel);

	const config: ApiServerConfig = {
		server: {
			prefix: getEnv('APP_PREFIX', '/api'),
			port: parseInt(getEnv('PORT', '8080'), 10),
			logger
		},

		keetaNet: {
			fxAccount: KeetaNet.lib.Account.fromSeed(getEnv('KEETANET_SEED'), 0)
		}
	}

	let server: Awaited<ReturnType<typeof createApiServer>>['server'];
	try {
		let info;
		({ server, info } = await createApiServer(config));

		const address = info.address === "::" ? "localhost" : info.address;
		logger?.log(`Server is running at http://${address}:${info.port}`);

		// graceful shutdown
		process.on('beforeExit', function() {
			if (server.listening) {
				server.close()
			}
		});
	} catch (error: unknown) {
		logger?.error("Error starting server:", error);
	}

	await new Promise<void>(function(resolve) {
		server.on('close', function() {
			resolve();
		});
	});

	return(0);
}

main().then(function(code) {
	process.exit(code);
}, function(error: unknown) {
	console.error(error);
	process.exit(1);
});
