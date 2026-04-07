import type { KeetaAnchorFXServerConfig } from "@keetanetwork/anchor/services/fx/server";
import { KeetaNetFXAnchorHTTPServer } from "@keetanetwork/anchor/services/fx/server";

import type * as Anchor from "@keetanetwork/anchor";
import { createFXHandler } from "./app";
import { getTokenInfo } from "./utils/network";

/**
 * Configuration interface for creating a KeetaNet FX Anchor server.
 *
 * Extends the base KeetaAnchorFXServerConfig with required account and client properties.
 *
 * @property account - KeetaNet account instance created from a seed, used for signing quotes and authenticating server operations
 * @property userClient - KeetaNet UserClient instance for network interactions and token operations
 * @property port - Port number on which the HTTP server will listen (inherited from KeetaAnchorFXServerConfig)
 * @property logger - Optional logger instance for debugging and server operation logs (inherited from KeetaAnchorFXServerConfig)
 */
export interface ServerConfig extends Pick<KeetaAnchorFXServerConfig, 'port' | 'logger'> {
	account: NonNullable<Parameters<typeof Anchor.KeetaNet.UserClient.fromNetwork>[1]>,
	userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>
}

/**
 * Creates and starts a KeetaNet FX Anchor HTTP server with custom exchange rate logic.
 *
 * This function initializes an FX Anchor server that handles exchange conversion requests
 * between different tokens on the KeetaNet network. User is responsible for managing rates.
 *
 * @param config - Server configuration object
 * @param config.account - KeetaNet account used for signing quotes and server operations
 * @param config.userClient - Client instance for interacting with the KeetaNet network
 * @param config.port - Port number on which the HTTP server will listen
 * @param config.logger - Optional logger instance for debugging and logging server operations
 * @returns A promise that resolves to the initialized and started KeetaNetFXAnchorHTTPServer instance
 *
 * @example
 * ```typescript
 * const server = await createServer({
 *   account: myAccount,
 *   userClient: myClient,
 *   port: 3000,
 *   logger: console
 * });
 * ```
 */
export async function createServer({ account, userClient, port, logger }: ServerConfig) {
	// Get base token info
	const baseTokenInfo = await getTokenInfo(userClient, userClient.baseToken)

	// Set up the FX Anchor HTTP server
	const server = new KeetaNetFXAnchorHTTPServer({
		account,
		client: userClient,
		quoteSigner: account,
		port,
		logger,
		fx: createFXHandler({ userClient, logger, account, baseTokenInfo })
	})

	// Start the server
	await server.start()

	return(server);
}
