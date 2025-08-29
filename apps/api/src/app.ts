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
import { KeetaNet } from "@keetanetwork/anchor";
import { urlSafeBase64ToBinary } from "./utils/base64";

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
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		const fxClient = c.get("fxClient")
		const userClient = c.get("userClient")
		const logger = c.get("log")

		// Step 1: Look up the token information for both currencies
		logger?.debug(`Creating quote for ${request.from} -> ${request.to}`)

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
		logger?.debug(`Quote calculated - rate: ${rate}, converted amount: ${convertedAmount}, to amount: ${toAmount}`)

		// Step 4: Check balance
		const balance = new Numeric(await userClient.balance(toToken.token))
		logger?.debug(`Balance for ${request.to}: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}`)

		const requestedAmount = Numeric.fromDecimalString(toAmount, toTokenInfo.decimalPlaces)
		logger?.debug(`Requested amount: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`)

		if (balance.valueOf() < requestedAmount.valueOf()) {
			throw(new AppError(`Insufficient balance. Available: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}, Required: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`));
		}

		// Step 5: Calculate actual cost (network fees, processing fees)
		const baseFee = userClient.baseToken.comparePublicKey(fromToken.token) ? "0.001" : "0.002"
		const processingFee = request.amount.mul(0.005).toString() // 0.5% of transaction
		const actualCostAmount = Numeric.fromDecimalString(baseFee, 9).valueOf() + Numeric.fromDecimalString(processingFee, 9).valueOf()

		// Step 6: Generate quote signature data
		const timestamp = (new Date()).toISOString()
		const nonce = crypto.randomUUID()

		// In a real implementation, this would be signed with a private key
		// For demo purposes, we're using an empty signature
		const signature = ""

		// Step 7: Return the quote with original request echoed back
		return(c.json({
			ok: true,
			request: {
				from: request.from,
				to: request.to,
				amount: request.amount.toString(),
				affinity: request.affinity
			},
			quote: {
				account: userClient.account.publicKeyString.get(),
				rate: rate.toString(),
				convertedAmount,
				signed: {
					nonce,
					timestamp,
					signature
				}
			},
			cost: {
				amount: new Numeric(actualCostAmount).toDecimalString(9),
				token: userClient.baseToken.publicKeyString.get()
			}
		}));
	})

	/**
	 * Execute a token swap
	 */
	.post("/anchor/executeExchange", validator("json", (i: ExecuteExchangeSchema) => v.parse(executeExchangeSchema, i)), async c => {
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		const userClient = c.get("userClient")

		// Step 1: Validate quote and Signature
		// XXX:TODO: Implement validation logic

		// Step 2: Get the SWAP Block
		// Get the block buffer from the URL-safe base64 string
		const blockBuffer = urlSafeBase64ToBinary(request.block).buffer

		// Create a new block instance
		const block = new KeetaNet.lib.Block(blockBuffer)

		// Get the send and receive operations
		const sendOperation = block.operations.find(({ type }) => KeetaNet.lib.Block.OperationType.SEND === type)
		const receiveOperation = block.operations.find(({ type }) => KeetaNet.lib.Block.OperationType.RECEIVE === type)

		// Check if the operations are valid
		if (!sendOperation || !receiveOperation || sendOperation.type !== KeetaNet.lib.Block.OperationType.SEND || receiveOperation.type !== KeetaNet.lib.Block.OperationType.RECEIVE) {
			throw(new AppError("Invalid block operations"));
		}

		// Check if I am the destination of the swap
		if (!sendOperation.to.comparePublicKey(userClient.account)) {
			throw(new AppError("This swap isn't for me. The destination account does not match."));
		}

		// Create the transaction builder
		const builder = userClient.initBuilder()

		// Add the send operation to the builder
		builder.send(block.account, receiveOperation.amount, receiveOperation.token)

		// Compute the send operation block
		const { blocks: [computedSendBlock] } = await builder.computeBlocks()

		/**
		 * Transmit the blocks
		 *
		 * To execute the swap, is necessary to transmit the send block
		 * first (from the account that is accepting the swap) and then
		 * the swap block with the send and receive operations.
		 */
		await userClient.client.transmit([computedSendBlock, block])

		return(c.json({
			ok: true,
			exchangeID: computedSendBlock.hash.toString()
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
