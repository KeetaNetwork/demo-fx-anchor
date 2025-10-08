import { describe, expect, afterEach } from 'vitest';
import { Log as Logger } from '@keetanetwork/anchor/lib/log';
import { LogTargetConsole } from '@keetanetwork/anchor/lib/log/target_console';
import { expectNonNullable, setup, setupResolver } from './utils/testing';
import { createServer } from './server';
import * as Anchor from "@keetanetwork/anchor";

const KeetaNet = Anchor.KeetaNet

const logOptions = { currentRequestInfo: { id: "TEST-RUN" }};

describe('Server', async () => {
	// Setup logger
	const logger = new Logger();

	// Log all setup infos
	const setupTarget = logger.registerTarget(new LogTargetConsole({ logLevel: 'DEBUG' }));
	logger.startAutoSync();

	// Setup test environment
	const { fxAccount, fxUserClient, lpUserClient, tokens } = await setup(logger);

	// Setup server
	const server = await createServer({ account: fxAccount, userClient: fxUserClient, logger })

	// Server URL
	const baseURL = server.url;
	logger.info(logOptions, "baseURL", baseURL)

	// Setup resolver
	const { resolverAccount } = await setupResolver(baseURL, fxUserClient, tokens, logger)

	// Stop automatic logger after setup.
	logger.unregisterTarget(setupTarget)
	logger.stopAutoSync()

	afterEach(async (context) => {
		// Show all DEBUG logs when test fails
		const targetID = logger.registerTarget(new LogTargetConsole({
			logLevel: context.task.result?.state === 'fail' ? 'DEBUG' : 'WARN'
		}));

		// Emit logs
		await logger.sync()

		// Remove target.
		logger.unregisterTarget(targetID);
	})

	describe("FX Client", ({ sequential }) => {
		// Run tests in sequence to avoid problems with head block.
		const it = sequential

		// Create a dummy user account for testing
		const userAccount = KeetaNet.lib.Account.fromSeed(KeetaNet.lib.Account.generateRandomSeed(), 0);
		const userClient = KeetaNet.UserClient.fromNetwork('test', userAccount);

		// Send funds to user account
		it("Send funds to user account", async () => {
			const ADD_USER_USD = 200_000_00n // 200,000.00
			const ADD_USER_EUR = 200_000_00n // 200,000.00
			const ADD_USER_KTA = 200_000_000000000n // 200,000.000000000
			await lpUserClient.send(userAccount, ADD_USER_USD, tokens.USD, undefined, { account: tokens.USD })
			await lpUserClient.send(userAccount, ADD_USER_EUR, tokens.EUR, undefined, { account: tokens.EUR })
			await lpUserClient.send(userAccount, ADD_USER_KTA, tokens.$KTA, undefined, { account: tokens.$KTA })
			logger.info(logOptions, "FX.Client", "Sent funds to user account")

			expect(await userClient.balance(tokens.USD)).toBe(ADD_USER_USD)
			expect(await userClient.balance(tokens.EUR)).toBe(ADD_USER_EUR)
			expect(await userClient.balance(tokens.$KTA)).toBe(ADD_USER_KTA)
		})

		/**
		 * Tests
		 */
		const tests = [
			// Convert USD to EUR.
			{
				title: "Convert 500.00 USD to EUR (expected = 588.23 EUR)",
				affinity: "from",
				amount: 50000n, // 500.00
				from: tokens.USD,
				to: tokens.EUR,

				expectedConvertedAmount: 58823n
			},

			// Convert EUR to USD.
			{
				title: "Convert EUR to 500.00 USD. (expected = 588.23 EUR)",
				affinity: "to",
				amount: 50000n, // 500.00
				from: tokens.EUR,
				to: tokens.USD,

				expectedConvertedAmount: 58823n
			},

			// Convert EUR to BTC
			{
				title: "Convert KTA to 1.00000000 BTC (expected = 110,302.228105007 KTA)",
				affinity: "to",
				amount: 1_00000000n, // 1.00000000
				from: tokens.$KTA,
				to: tokens.$BTC,

				expectedConvertedAmount: 110302228105007n
			}
		] as const

		for (const test of tests) {
			it(test.title, async () => {
				logger.debug(logOptions, "FX.Client", "test =", test)

				// Create FX Client
				const fxClient = new Anchor.FX.Client(userClient, { root: resolverAccount })

				// Get Estimates
				const estimates = await fxClient.getEstimates({
					affinity: test.affinity,
					amount: test.amount.toString(),
					from: test.from,
					to: test.to
				})
				logger.info(logOptions, "FX.Client", "Got estimates")
				logger.debug(logOptions, "FX.Client", "estimates =", estimates)

				expectNonNullable(estimates);
				expect(estimates.length).toBe(1)

				const [selected] = estimates
				expect(selected.estimate.convertedAmount).toBe(test.expectedConvertedAmount.toString())

				const quote = await selected.getQuote()
				expect(quote.quote.convertedAmount).toBe(test.expectedConvertedAmount.toString())
				logger.info(logOptions, "FX.Client", "Got quote")
				logger.debug(logOptions, "FX.Client", "quote.quote =", quote.quote)

				const createdExchange = await quote.createExchange()
				expect(createdExchange.exchange.exchangeID).toBeDefined()
				logger.info(logOptions, "FX.Client", "Created exchange")
				logger.debug(logOptions, "FX.Client", "createdExchange.exchange =", createdExchange.exchange)

				// const exchangeStatus = await createdExchange.getExchangeStatus()
				// logger.debug(logOptions, "FX.Client", "Exchange status =", exchangeStatus)
			})
		}
	})
})

