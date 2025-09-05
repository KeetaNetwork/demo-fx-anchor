import { KeetaNet } from "@keetanetwork/anchor";
import type { ApiServerConfig } from "./server";
import { createApiServer } from "./server";
import { getEnv } from "./utils/config";
import type { LogTargetLevel } from '@keetanetwork/anchor/lib/log/common';
import { Log as Logger } from '@keetanetwork/anchor/lib/log';
import { LogTargetConsole } from '@keetanetwork/anchor/lib/log/target_console';

const AsyncDisposableStack = KeetaNet.lib.Utils.Helper.AsyncDisposableStack;

async function main(): Promise<0 | 1> {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const targetLevel = getEnv('APP_LOG_LEVEL', 'WARN') as LogTargetLevel;
	const logger = new Logger();
	logger.registerTarget(new LogTargetConsole({
		logLevel: targetLevel
	}));
	logger.startAutoSync();
	const cleanup = new AsyncDisposableStack();
	cleanup.defer(function() {
		logger.stopAutoSync();
	});

	const resolver = getEnv('APP_RESOLVER_ACCOUNT', '').trim();

	const config: ApiServerConfig = {
		server: {
			prefix: getEnv('APP_PREFIX', '/api'),
			port: parseInt(getEnv('PORT', '8080'), 10),
			logger
		},

		keetaNet: {
			fxAccount: KeetaNet.lib.Account.fromSeed(getEnv('APP_SEED'), 0),
			resolverAccount: resolver.length > 0 ? KeetaNet.lib.Account.fromPublicKeyString(resolver) : undefined
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
