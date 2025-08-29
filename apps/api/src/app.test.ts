import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testClient } from 'hono/testing'
import { type ApiServerConfig, createApp } from './server'
import type { AppSchema } from './app'
import { Logger } from './utils/logger'
import { setup } from './utils/testing'
import { calculateExchangeRate } from './utils/exchange-rate'

// Mock the calculateExchangeRate function
vi.mock('./utils/exchange-rate', () => ({
	calculateExchangeRate: vi.fn()
}))

const mockedCalculateExchangeRate = vi.mocked(calculateExchangeRate)

describe('API Tests', async () => {
	// Setup logger
	const logger = new Logger('INFO');

	// Setup test environment
	const { fxAccount, fxUserClient, lpAccount, lpUserClient, resolverAccount, resolverUserClient, tokens } = await setup(logger);

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
			expect(JSON.stringify(data.request)).toBe(JSON.stringify(request))

			// Verify the mocked exchange rate is used
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.estimate.rate).toBe('0.85')
			expect(data.estimate.convertedAmount).toBe('85.00') // 100 * 0.85

			expect(data.expectedCost.min).toBeDefined()
			expect(data.expectedCost.max).toBeDefined()
			expect(data.expectedCost.token).toBeDefined()

			const dataTo = await client.anchor.getEstimate.$post({ json: { request: { ...request, affinity: 'to' }}}).then(r => r.json())

			expect(dataTo.estimate.rate).toBe('0.85')
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
			expect(JSON.stringify(data.request)).toBe(JSON.stringify(request))

			// Verify the mocked exchange rate is used
			expect(mockedCalculateExchangeRate).toHaveBeenCalledWith('USD', 'EUR')
			expect(data.quote.rate).toBe('0.85')
			expect(data.quote.convertedAmount).toBe('85.00') // 100 * 0.85

			// Verify quote structure
			expect(data.quote.account).toBeDefined()
			expect(data.quote.signed.nonce).toBeDefined()
			expect(data.quote.signed.timestamp).toBeDefined()
			expect(data.quote.signed.signature).toBe('') // Empty for demo

			// Verify cost is calculated
			expect(data.cost.amount).toBeDefined()
			expect(data.cost.token).toBeDefined()
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
			expect(data.quote.rate).toBe('1.18')
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
})
