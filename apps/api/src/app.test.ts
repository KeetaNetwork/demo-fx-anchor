import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testClient } from 'hono/testing'
import { type ApiServerConfig, createApp } from './server'
import type { AppSchema } from './app'
import { Logger } from './utils/logger'
import { setup } from './utils/testing'
import { calculateExchangeRate } from './utils/exchange-rate'
import { KeetaNet } from '@keetanetwork/anchor'
import { getTokenInfo } from './utils/network'
import { Numeric } from './utils/numeric'
import { binaryToUrlSafeBase64 } from './utils/base64'

// Mock the calculateExchangeRate function
vi.mock('./utils/exchange-rate', () => ({
	calculateExchangeRate: vi.fn()
}))

const mockedCalculateExchangeRate = vi.mocked(calculateExchangeRate)

describe('API Tests', async () => {
	// Setup logger
	const logger = new Logger('INFO');

	// Setup test environment
	const { fxAccount, fxUserClient, lpUserClient, resolverAccount, tokens } = await setup(logger);

	// Mock config for testing
	const testConfig: ApiServerConfig = {
		server: {
			prefix: '/',
			logger
		},
		keetaNet: {
			fxAccount: fxAccount,
			resolverAccount: resolverAccount
		}
	}
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const app = createApp(testConfig) as AppSchema
	const client: ReturnType<typeof testClient<AppSchema>> = testClient(app)

	describe('getEstimate', () => {
		beforeEach(() => {
			// Reset mocks before each test
			vi.clearAllMocks()
			// Set up default mock behavior
			mockedCalculateExchangeRate.mockReturnValue(0.85) // USD to EUR rate
		})

		/**
		 * Successful estimate retrieval
		 */
		it('should return a valid estimate for USD to EUR exchange', async () => {
			const request = {
				from: 'USD',
				to: 'EUR',
				amount: '100',
				affinity: 'from'
			}

			const response = await client.anchor.getEstimate.$post({ json: { request }})
			const data = await response.json()

			expect(response.status).toBe(200)
			expect(data.ok).toBeTruthy()
			expect(JSON.stringify(data.estimate.request)).toBe(JSON.stringify(request))

			// Verify the mocked exchange rate is used
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.estimate.convertedAmount).toBe('85.00') // 100 * 0.85

			expect(data.estimate.expectedCost.min).toBeDefined()
			expect(data.estimate.expectedCost.max).toBeDefined()
			expect(data.estimate.expectedCost.token).toBeDefined()

			const dataTo = await client.anchor.getEstimate.$post({ json: { request: { ...request, affinity: 'to' }}}).then(r => r.json())

			expect(dataTo.estimate.convertedAmount).toBe('117.65') // 100 / 0.85
		})

		/**
		 * Unsuccessful estimate retrieval
		 */
		it('should return error for excessive amount', async () => {
			const response = await client.anchor.getEstimate.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '1000000000.00',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)
		})

		it('should return error for invalid currency code', async () => {
			const response = await client.anchor.getEstimate.$post({
				json: {
					request: {
						from: 'INVALID_CURRENCY',
						to: 'EUR',
						amount: '100',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)
		})

		it('should return error for missing required fields', async () => {
			const response = await client.anchor.getEstimate.$post({
				// eslint-disable-next-line
				json: {
					request: {
						from: 'USD'
						// Missing to, amount, affinity
					}
				} as any // eslint-disable-line
			})

			expect(response.status).toBe(400)
		})

		it('should return error for zero or negative amount', async () => {
			const response = await client.anchor.getEstimate.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '0',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)

			const responseNeg = await client.anchor.getEstimate.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: -1,
						affinity: 'from'
					}
				}
			})
			expect(responseNeg.status).toBe(400)
		})

		it('should return error for invalid affinity value', async () => {
			const response = await client.anchor.getEstimate.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '100',
						affinity: 'invalid'
					}
				}
			})
			expect(response.status).toBe(400)
		})
	})

	describe('createQuote', () => {
		beforeEach(() => {
			// Reset mocks before each test
			vi.clearAllMocks()
			// Set up default mock behavior
			mockedCalculateExchangeRate.mockReturnValue(0.85) // USD to EUR rate
		})

		/**
		 * Successful quote creation
		 */
		it('should return a valid quote for USD to EUR exchange', async () => {
			const request = {
				from: 'USD',
				to: 'EUR',
				amount: '100',
				affinity: 'from'
			}

			const response = await client.anchor.createQuote.$post({ json: { request }})
			const data = await response.json()

			expect(response.status).toBe(200)
			expect(data.ok).toBeTruthy()
			expect(JSON.stringify(data.quote.request)).toBe(JSON.stringify(request))

			// Verify the mocked exchange rate is used
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.quote.convertedAmount).toBe('85.00') // 100 * 0.85

			// Verify quote structure
			expect(data.quote.account).toBeDefined()
			expect(data.quote.signed.nonce).toBeDefined()
			expect(data.quote.signed.timestamp).toBeDefined()
			expect(data.quote.signed.signature).toBe('') // Empty for demo

			// Verify cost is calculated
			expect(data.quote.cost.amount).toBeDefined()
			expect(data.quote.cost.token).toBeDefined()
		})

		it('should use mocked exchange rate for different currency pairs in quote', async () => {
			// Mock a different exchange rate for EUR to USD
			mockedCalculateExchangeRate.mockReturnValue(1.18)

			const request = {
				from: 'USD',
				to: 'EUR',
				amount: '100',
				affinity: 'from'
			}

			const response = await client.anchor.createQuote.$post({ json: { request }})
			const data = await response.json()

			expect(response.status).toBe(200)
			expect(data.ok).toBeTruthy()

			// Verify the mocked exchange rate is used
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.quote.convertedAmount).toBe('118.00') // 100 * 1.18
		})

		it('should handle "to" affinity correctly in quote', async () => {
			const request = {
				from: 'USD',
				to: 'EUR',
				amount: '85',
				affinity: 'to'
			}

			const response = await client.anchor.createQuote.$post({ json: { request }})
			const data = await response.json()

			expect(response.status).toBe(200)
			expect(data.ok).toBeTruthy()

			// With affinity 'to', the amount is what they want to receive
			// So convertedAmount should be the amount they need to pay in 'from' currency
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.quote.convertedAmount).toBe('100.00') // 85 / 0.85 = 100
		})

		/**
		 * Error cases for createQuote
		 */
		it('should return error for excessive amount in quote', async () => {
			const response = await client.anchor.createQuote.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '1000000000.00',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)
		})

		it('should return error for invalid currency code in quote', async () => {
			const response = await client.anchor.createQuote.$post({
				json: {
					request: {
						from: 'INVALID_CURRENCY',
						to: 'EUR',
						amount: '100',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)
		})

		it('should return error for missing required fields in quote', async () => {
			const response = await client.anchor.createQuote.$post({
				// eslint-disable-next-line
				json: {
					request: {
						from: 'USD'
						// Missing to, amount, affinity
					}
				} as any // eslint-disable-line
			})

			expect(response.status).toBe(400)
		})

		it('should return error for zero or negative amount in quote', async () => {
			const response = await client.anchor.createQuote.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '0',
						affinity: 'from'
					}
				}
			})
			expect(response.status).toBe(400)

			const responseNeg = await client.anchor.createQuote.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: -1,
						affinity: 'from'
					}
				}
			})
			expect(responseNeg.status).toBe(400)
		})

		it('should return error for invalid affinity value in quote', async () => {
			const response = await client.anchor.createQuote.$post({
				json: {
					request: {
						from: 'USD',
						to: 'EUR',
						amount: '100',
						affinity: 'invalid'
					}
				}
			})
			expect(response.status).toBe(400)
		})
	})

	describe('executeExchange', async () => {
		// Create a dummy user account for testing
		const userAccount = KeetaNet.lib.Account.fromSeed(KeetaNet.lib.Account.generateRandomSeed(), 0);
		const userClient = KeetaNet.UserClient.fromNetwork('test', userAccount);

		// Send funds to user account
		const ADD_USER_USD = 1_000_00n
		await lpUserClient.send(userAccount, ADD_USER_USD, tokens.USD, undefined, { account: tokens.USD })

		it('should execute exchange with valid quote', async () => {
			// Quote
			const quote = {
				request: {
					from: 'USD',
					to: 'EUR',
					amount: '100',
					affinity: 'from'
				},
				account: fxAccount.publicKeyString.get(),
				convertedAmount: '118.00',
				signed: {
					nonce: crypto.randomUUID(),
					timestamp: (new Date()).toISOString(),
					signature: ""
				},
				cost: {
					token: fxUserClient.baseToken.publicKeyString.get(),
					amount: new Numeric(1).toDecimalString(9)
				}
			}

			/**
			 * Verify before exchange
			 */
			// Check user account balance before exchange
			const [userBalanceUSDBefore, userBalanceEURBefore] = await Promise.all([
				userClient.balance(tokens.USD),
				userClient.balance(tokens.EUR)
			]);
			expect(userBalanceUSDBefore).toBe(ADD_USER_USD);
			expect(userBalanceEURBefore).toBe(0n);

			// Get FX account balance before exchange
			const [fxBalanceUSDBefore, fxBalanceEURBefore] = await Promise.all([
				fxUserClient.balance(tokens.USD),
				fxUserClient.balance(tokens.EUR)
			]);

			// Get token info
			const [sendTokenInfo, receiveTokenInfo] = await Promise.all([
				getTokenInfo(fxUserClient, tokens.USD),
				getTokenInfo(fxUserClient, tokens.EUR)
			]);

			/**
			 * Create SWAP Block
			 */
			// Calculate amount
			const sendAmount = Numeric.fromDecimalString(quote.request.amount, sendTokenInfo.decimalPlaces);
			const receiveAmount = Numeric.fromDecimalString(quote.convertedAmount, receiveTokenInfo.decimalPlaces);

			// Create the transaction
			const builder = userClient.initBuilder()
			builder.send(fxAccount, sendAmount.valueOf(), tokens.USD)
			builder.receive(fxAccount, receiveAmount.valueOf(), tokens.EUR, true)

			// Compute the transaction and get the block
			const { blocks: [computedBlock] } = await builder.computeBlocks()

			// Get the block bytes and convert to Uint8Array
			const bytes = computedBlock.toBytes()
			const uint8Array = new Uint8Array(bytes)

			// Convert to URL-safe Base64
			const block = binaryToUrlSafeBase64(uint8Array)

			// Execute the exchange
			const response = await client.anchor.executeExchange.$post({ json: { request: { block, quote }}})
			const data = await response.json()
			expect(response.status).toBe(200)
			expect(data.ok).toBeTruthy()
			expect(data.exchangeID).toBeDefined()

			/**
			 * Verify after exchange
			 */
			const [userBalanceUSDAfter, userBalanceEURAfter] = await Promise.all([
				userClient.balance(tokens.USD),
				userClient.balance(tokens.EUR)
			]);
			expect(userBalanceUSDAfter).toBe(ADD_USER_USD - sendAmount.valueOf());
			expect(userBalanceEURAfter).toBe(receiveAmount.valueOf());

			// Get FX account balance after exchange
			const [fxBalanceUSDAfter, fxBalanceEURAfter] = await Promise.all([
				fxUserClient.balance(tokens.USD),
				fxUserClient.balance(tokens.EUR)
			]);
			expect(fxBalanceUSDAfter).toBe(fxBalanceUSDBefore + sendAmount.valueOf());
			expect(fxBalanceEURAfter).toBe(fxBalanceEURBefore - receiveAmount.valueOf());
		});

		// XXX:TODO: Add more tests for executeExchange (invalid quote, invalid block, etc)
	})
})
