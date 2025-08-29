import * as v from "valibot";
import { Hono } from "hono";
import { validator } from "hono/validator";
import type { ServerEnv } from "./server";
import type { CreateQuoteSchema, ExecuteExchangeSchema, GetEstimateSchema, GetExchangeStatusParamSchema } from "./schema/anchor";
import { getEstimateSchema, createQuoteSchema, executeExchangeSchema, getExchangeStatusParamSchema } from "./schema/anchor";
import { AppError } from "./error";
import { getTokenInfo } from "./utils/network";
import { Numeric } from "./utils/numeric";

// Check if the request is signed and valid.
// if (!(await verifySignedData(data.request))) {
// 	return(c.json({
// 		ok: false,
// 		error: "Invalid signed data"
// 	}, 400));
// }


const app = new Hono<ServerEnv>()
	/**
	 * Get an estimate for a token swap
	 */
	.post("/anchor/getEstimate", validator("json", (i: GetEstimateSchema) => v.parse(getEstimateSchema, i)), async c => {
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		const fxClient = c.get("fxClient")
		const userClient = c.get("userClient")
		const logger = c.get("log")

		// Step 1: Look up the token information for both currencies
		logger?.debug(`Looking up tokens for ${request.from} -> ${request.to}`)

		const fromToken = await fxClient.resolver.lookupToken(request.from)
		const toToken = await fxClient.resolver.lookupToken(request.to)

		if (!fromToken || !toToken) {
			throw(new AppError(`Currency ${!fromToken ? request.from : request.to} not found`));
		}

		// Step 2: Calculate exchange rate (mock for now - replace with actual rate service)
		// For demo purposes, using a simple mock rate
		const mockRates = {
			'USD-EUR': 0.85,
			'EUR-USD': 1.18,
			'USD-BTC': 0.000023,
			'BTC-USD': 43000
		}

		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const rateKey = `${request.from}-${request.to}` as keyof typeof mockRates
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const reverseRateKey = `${request.to}-${request.from}` as keyof typeof mockRates
		let rate = mockRates[rateKey] || (1 / (mockRates[reverseRateKey] || 1))

		// Step 3: Calculate converted amount based on affinity
		let toAmount: string
		let convertedAmount: string
		if (request.affinity === 'from') {
			convertedAmount = request.amount.mul(rate).toFixed()
			toAmount = convertedAmount
		} else {
			// If affinity is 'to', the amount is what they want to receive
			toAmount = request.amount.toString()
			convertedAmount = request.amount.div(rate).toFixed()
			rate = request.amount.div(request.amount.div(rate)).toNumber()
		}
		logger?.debug(`Calculated rate: ${rate}, converted amount: ${convertedAmount}, to amount: ${toAmount}`)

		// Step 4: Check balance
		const tokenInfo = await getTokenInfo(userClient, toToken.token)
		const balance = new Numeric(await userClient.balance(toToken.token))
		logger?.debug(`Balance for ${request.to}: ${balance.toDecimalString(tokenInfo.decimalPlaces)}`)

		const requestedAmount = Numeric.fromDecimalString(toAmount, tokenInfo.decimalPlaces)
		logger?.debug(`Requested amount: ${requestedAmount.toDecimalString(tokenInfo.decimalPlaces)}`)

		if (balance.valueOf() < requestedAmount.valueOf()) {
			throw(new AppError(`Insufficient balance. Available: ${balance.toDecimalString(tokenInfo.decimalPlaces)}, Required: ${requestedAmount.toDecimalString(tokenInfo.decimalPlaces)}`));
		}

		// Step 5: Calculate expected cost (network fees, processing fees)
		const baseFee = userClient.baseToken.comparePublicKey(fromToken.token) ? "0.001" : "0.002"

		const expectedCost = {
			min: baseFee,
			max: request.amount.mul(0.005).toString(), // Max 0.5% of transaction
			token: userClient.baseToken.publicKeyString.get()
		}

		// Step 6: Return the result with original request echoed back
		return(c.json({
			ok: true,
			request: {
				from: request.from,
				to: request.to,
				amount: request.amount.toString(),
				affinity: request.affinity
			},
			estimate: {
				rate: rate.toString(),
				convertedAmount
			},
			expectedCost
		}));
	})

	/**
	 * Create a quote for a token swap
	 */
	.post("/anchor/createQuote", validator("json", (i: CreateQuoteSchema) => v.parse(createQuoteSchema, i)), async c => {
		return(c.json({
			ok: true,
			quote: {
				rate: 0,
				amount: "",
				affinity: "from",
				signed: {
					nonce: "",
					timestamp: "",
					signature: ""
				}
			},
			cost: {
				amount: "",
				token: c.get("userClient").baseToken.publicKeyString.toString()
			}
		}));
	})

	/**
	 * Execute a token swap
	 */
	.post("/anchor/executeExchange", validator("json", (i: ExecuteExchangeSchema) => v.parse(executeExchangeSchema, i)), async c => {
		return(c.json({
			ok: true,
			blockhash: ""
		}));
	})

	/**
	 * Get the status of a token swap
	 */
	.get("/anchor/getExchangeStatus/:blockhash", validator("param", (i: GetExchangeStatusParamSchema) => v.parse(getExchangeStatusParamSchema, i)), async c => {
		return(c.json({
			ok: true,
			blockhash: ""
		}));
	})

export default app
export type AppSchema = typeof app
