import * as Anchor from "@keetanetwork/anchor";
import { KeetaNetFXAnchorHTTPServer } from "@keetanetwork/anchor/services/fx/server";
import { getEnv } from "./utils/config";
import type { LogTargetLevel } from "@keetanetwork/anchor/lib/log/common";
import LogTargetConsole from "@keetanetwork/anchor/lib/log/target_console";
import { Log as Logger } from '@keetanetwork/anchor/lib/log';
import { getTokenInfo } from "./utils/network";
import { getExchangeRate } from "./utils/rates";
import { Numeric } from "@keetanetwork/web-ui-utils/helpers/Numeric";
import Decimal from "decimal.js";

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

	/**
	 * Set up the FX Anchor HTTP server
	 */
	await using server = new KeetaNetFXAnchorHTTPServer({
		account,
		client: userClient,
		quoteSigner: account,
		port,
		logger,
		fx: {
			getConversionRateAndFee: async function(request) {
				/**
				 * Look up the token information for both currencies
				 */
				const [fromTokenInfo, toTokenInfo] = await Promise.all([
					getTokenInfo(userClient, request.from),
					getTokenInfo(userClient, request.to)
				])

				/**
				 * Calculate exchange rate
				 */
				logger?.debug(`Calculating exchange rate for ${fromTokenInfo.currencyCode} -> ${toTokenInfo.currencyCode}`);
				const { rate } = await getExchangeRate(fromTokenInfo.currencyCode, toTokenInfo.currencyCode);
				logger?.debug(`Base rate: ${rate}`)

				/**
				 * Calculate converted amount based on affinity
				 */
				const requestAmount = new Decimal(request.amount)
				let convertedAmount: string
				if (request.affinity === 'from') {
					convertedAmount = new Numeric(requestAmount.mul(rate).toFixed(0)).toDecimalString(fromTokenInfo.decimalPlaces)
					convertedAmount = Numeric.fromDecimalString(convertedAmount, toTokenInfo.decimalPlaces).toString()
				} else {
					convertedAmount = new Numeric(requestAmount.div(rate).toFixed(0)).toDecimalString(toTokenInfo.decimalPlaces)
					convertedAmount = Numeric.fromDecimalString(convertedAmount, fromTokenInfo.decimalPlaces).toString()
				}

				/**
				 *  Calculate cost (network fees, processing fees)
				 */
				// For demo purposes, we set cost to 0
				const cost = {
					amount: '0',
					token: userClient.baseToken.publicKeyString.get()
				}

				// Return the converted amount and cost
				return({
					account: account.publicKeyString.get(),
					convertedAmount,
					cost
				});
			}
		}
	})

	// Start the server
	await server.start();

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
