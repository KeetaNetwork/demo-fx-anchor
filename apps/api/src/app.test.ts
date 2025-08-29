import { describe, it, expect } from 'vitest'
import { testClient } from 'hono/testing'
import { type ApiServerConfig, createApp } from './server'
import type { AppSchema } from './app'
import { Logger } from './utils/logger'
import { setup } from './utils/testing'

describe('API Tests', async () => {
	const { fxAccount, fxUserClient, lpAccount, lpUserClient, resolverAccount, resolverUserClient, tokens } = await setup();

	const logger = new Logger('INFO');

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
			expect(data.ok).toBeTruthy();
			expect(JSON.stringify(data.request)).toBe(JSON.stringify(request))
			expect(data.estimate.rate).toBeDefined();
			expect(data.estimate.convertedAmount).toBeDefined();
			expect(data.expectedCost.min).toBeDefined();
			expect(data.expectedCost.max).toBeDefined();
			expect(data.expectedCost.token).toBeDefined();
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
})
