import { describe, expect, afterEach } from 'vitest';
import { Log as Logger } from '@keetanetwork/anchor/lib/log';
import { LogTargetConsole } from '@keetanetwork/anchor/lib/log/target_console';
import { expectNonNullable, setup, setupResolver } from './utils/testing';
import { createServer } from './server';
import { createFXHandler } from './app';
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
				title: "Convert 500.00 USD to EUR (expected = 429.05 EUR)",
				affinity: "from",
				amount: 50000n, // 500.00
				from: tokens.USD,
				to: tokens.EUR,

				expectedConvertedAmount: 42905n
			},

			// Convert EUR to USD.
			{
				title: "Convert EUR to 500.00 USD. (expected = 429.05 EUR)",
				affinity: "to",
				amount: 50000n, // 500.00
				from: tokens.EUR,
				to: tokens.USD,

				expectedConvertedAmount: 42905n
			},

			// Convert USD to BTC
			{
				title: "Convert USD to 1.00000000 BTC (expected = 125,341.56 USD)",
				affinity: "to",
				amount: 1_00000000n, // 1.00000000
				from: tokens.USD,
				to: tokens.$BTC,

				expectedConvertedAmount: 125_341_56n
			},

			// Convert BTC to USD
			{
				title: "Convert 1.00000000 BTC to USD (expected = 125,341.56 USD)",
				affinity: "to",
				amount: 125_341_56n,
				from: tokens.$BTC,
				to: tokens.USD,

				expectedConvertedAmount: 1_00000000n
			},

			// Convert KTA to BTC
			{
				title: "Convert KTA to 1.00000000 BTC (expected = 162,944.027975594 KTA)",
				affinity: "to",
				amount: 1_00000000n, // 1.00000000
				from: tokens.$KTA,
				to: tokens.$BTC,

				expectedConvertedAmount: 162_944_027975594n
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
					amount: test.amount,
					from: test.from,
					to: test.to
				})
				logger.info(logOptions, "FX.Client", "Got estimates")
				logger.debug(logOptions, "FX.Client", "estimates =", estimates)

				expectNonNullable(estimates);
				expect(estimates.length).toBe(1)

				const [selected] = estimates
				expect(selected.estimate.convertedAmount).toBe(test.expectedConvertedAmount)

				const quote = await selected.getQuote()
				expect(quote.quote.convertedAmount).toBe(test.expectedConvertedAmount)
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
	describe("Invalid estimate requests", ({ sequential: it }) => {
		const usd = tokens.USD.publicKeyString.get();
		const eur = tokens.EUR.publicKeyString.get();
		const badChecksum = `${usd.slice(0, -1)}${usd.endsWith('a') ? 'b' : 'a'}`;

		const cases = [
			{ title: "non-integer amount", request: { from: usd, to: eur, amount: "0.1", affinity: "from" }, error: /Invalid amount/ },
			{ title: "zero amount", request: { from: usd, to: eur, amount: "0", affinity: "from" }, error: /greater than zero/ },
			{ title: "negative amount", request: { from: usd, to: eur, amount: "-100", affinity: "from" }, error: /greater than zero/ },
			{ title: "malformed from key", request: { from: badChecksum, to: eur, amount: "100", affinity: "from" }, error: /"from"/ },
			{ title: "malformed to key", request: { from: eur, to: badChecksum, amount: "100", affinity: "from" }, error: /"to"/ },
			{ title: "currency missing from the rate table", request: { from: tokens.JPY.publicKeyString.get(), to: eur, amount: "100", affinity: "from" }, error: /not supported/ }
		] as const;

		// The SDK's type check only lets token-prefixed keys through, so a non-token key is checked against the handler directly.
		it("rejects a non-token account key", async () => {
			const handler = createFXHandler({ userClient: fxUserClient, logger, account: fxAccount, baseTokenInfo: { currencyCode: 'KTA', decimalPlaces: 9 }});
			if (!('getConversionRateAndFee' in handler)) {
				throw(new Error('handler is missing getConversionRateAndFee'));
			}

			const nonToken = KeetaNet.lib.Account.fromSeed(KeetaNet.lib.Account.generateRandomSeed(), 0).publicKeyString.get();
			const request = { from: nonToken, to: eur, amount: "100", affinity: "from" } as unknown as Parameters<typeof handler.getConversionRateAndFee>[0];
			await expect(handler.getConversionRateAndFee(request, { purpose: 'estimate' })).rejects.toThrow(/"from"/);
		});

		for (const test of cases) {
			it(`returns 400 for ${test.title}`, async () => {
				const response = await fetch(new URL('/api/getEstimate', baseURL), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
					body: JSON.stringify({ request: test.request })
				});
				expect(response.status).toBe(400);
				const body: unknown = await response.json();
				expect(body).toMatchObject({ ok: false, error: expect.stringMatching(test.error) });
			});
		}
	});
})

