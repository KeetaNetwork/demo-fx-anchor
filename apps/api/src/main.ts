import * as Anchor from "@keetanetwork/anchor";
import { getEnv } from "./utils/config";
import LogTargetConsole from "@keetanetwork/anchor/lib/log/target_console";
import { Log as Logger } from '@keetanetwork/anchor/lib/log';
import { createServer } from "./server";

type LogTargetLevel = NonNullable<NonNullable<ConstructorParameters<typeof LogTargetConsole>[0]>['logLevel']>;

async function main(): Promise<0 | 1> {
	/**
	 * Configure logging
	 */
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const logLevel = getEnv('APP_LOG_LEVEL', 'WARN') as LogTargetLevel;
	const logger = new Logger();
	logger.registerTarget(new LogTargetConsole({ logLevel }));
	logger.startAutoSync();

	/**
	 * Set up KeetaNet client
	 */
	const account = Anchor.KeetaNet.lib.Account.fromSeed(getEnv('APP_SEED'), 0);
	const userClient = Anchor.KeetaNet.UserClient.fromNetwork('test', account);

	/**
	 * Set up the HTTP server
	 */
	const port = parseInt(getEnv('PORT', '8080'), 10)

	logger.log(`Starting Server on Port: ${port}`)
	// Set up the FX Anchor HTTP server
	await using server = await createServer({ account, userClient, port, logger })

	logger.log(`Server Started at ${server.url}`)
	// Wait for the server to stop
	await server.wait();

	// Cleanup
	logger.stopAutoSync();

	// Exit
	return(0);
}

main().then(function(code) {
	process.exit(code);
}, function(error: unknown) {
	console.error(error);
	process.exit(1);
});
