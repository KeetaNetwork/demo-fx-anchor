import * as v from "valibot";
import { Hono } from "hono";
import { validator } from "hono/validator";
import type { ServerEnv } from "./server";
import type { CreateQuoteSchema, ExecuteExchangeSchema, GetEstimateSchema, GetExchangeStatusParamSchema } from "./schema/anchor";
import { getEstimateSchema, createQuoteSchema, executeExchangeSchema, getExchangeStatusParamSchema } from "./schema/anchor";
import { AppError } from "./error";
import { getTokenInfo } from "./utils/network";
import { Numeric } from "./utils/numeric";
import { calculateExchangeRate } from "./utils/exchange-rate";

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

		const [fromToken, toToken] = await Promise.all([
			fxClient.resolver.lookupToken(request.from),
			fxClient.resolver.lookupToken(request.to)
		])

		if (!fromToken || !toToken) {
			throw(new AppError(`Currency ${!fromToken ? request.from : request.to} not found`));
		}

		const [fromTokenInfo, toTokenInfo] = await Promise.all([
			getTokenInfo(userClient, fromToken.token),
			getTokenInfo(userClient, toToken.token)
		])

		// Step 2: Calculate exchange rate
		let rate = calculateExchangeRate(request.from, request.to)

		// Step 3: Calculate converted amount based on affinity
		let toAmount: string
		let convertedAmount: string
		if (request.affinity === 'from') {
			convertedAmount = request.amount.mul(rate).toFixed(toTokenInfo.decimalPlaces)
			toAmount = convertedAmount
		} else {
			// If affinity is 'to', the amount is what they want to receive
			toAmount = request.amount.toString()
			convertedAmount = request.amount.div(rate).toFixed(fromTokenInfo.decimalPlaces)
			rate = request.amount.div(request.amount.div(rate)).toNumber()
		}
		logger?.debug(`Calculated rate: ${rate}, converted amount: ${convertedAmount}, to amount: ${toAmount}`)

		// Step 4: Check balance
		const balance = new Numeric(await userClient.balance(toToken.token))
		logger?.debug(`Balance for ${request.to}: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}`)

		const requestedAmount = Numeric.fromDecimalString(toAmount, toTokenInfo.decimalPlaces)
		logger?.debug(`Requested amount: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`)

		if (balance.valueOf() < requestedAmount.valueOf()) {
			throw(new AppError(`Insufficient balance. Available: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}, Required: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`));
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
			request: {
				from: 'USD',
				to: 'EUR',
				amount: 100,
				affinity: 'from'
			},
			quote: {
				account: c.get("userClient").account.publicKeyString.get(),
				rate: '0.88',
				convertedAmount: '88',
				signed: {
					nonce: crypto.randomUUID(),
					timestamp: (new Date()).toISOString(),
					signature: ''
				}
			},
			cost: {
				amount: '5',
				token: c.get("userClient").baseToken.publicKeyString.get()
			}
		}));
	})

	/**
	 * Execute a token swap
	 */
	.post("/anchor/executeExchange", validator("json", (i: ExecuteExchangeSchema) => v.parse(executeExchangeSchema, i)), async c => {
		return(c.json({
			ok: true,
			exchangeID: crypto.randomUUID()
		}));
	})

	/**
	 * Get the status of a token swap
	 */
	.get("/anchor/getExchangeStatus/:exchangeID", validator("param", (i: GetExchangeStatusParamSchema) => v.parse(getExchangeStatusParamSchema, i)), async c => {
		return(c.json({
			ok: true,
			exchangeID: c.req.valid("param").exchangeID
		}));
	})

export default app
export type AppSchema = typeof app
