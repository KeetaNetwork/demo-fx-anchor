import * as v from "valibot";
import { Hono } from "hono";
import { validator } from "hono/validator";
import type { ServerEnv } from "./server";
import type { CreateQuoteSchema, ExecuteExchangeSchema, GetEstimateSchema, GetExchangeStatusParamSchema } from "./schema/anchor";
import { getEstimateSchema, createQuoteSchema, executeExchangeSchema, getExchangeStatusParamSchema } from "./schema/anchor";
import { AppError } from "./error";
import { clearBalanceCache, getTokenBalance, getTokenInfo } from "./utils/network";
import { calculateExchangeRate } from "./utils/exchange-rate";
import { KeetaNet } from "@keetanetwork/anchor";
import { urlSafeBase64ToBinary } from "./utils/base64";
import { Numeric } from "@keetanetwork/web-ui-utils/helpers/Numeric";

const app = new Hono<ServerEnv>()
	/**
	 * Get an estimate for a token swap
	 */
	.post("/getEstimate", validator("json", (i: GetEstimateSchema) => v.parse(getEstimateSchema, i)), async c => {
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		const userClient = c.get("userClient")
		const logger = c.get("log")

		// Step 1: Look up the token information for both currencies
		const fromToken = { token: request.from }
		const toToken = { token: request.to }

		if (!fromToken || !toToken) {
			throw(new AppError(`Currency ${!fromToken ? request.from : request.to} not found`));
		}

		const [fromTokenInfo, toTokenInfo] = await Promise.all([
			getTokenInfo(userClient, fromToken.token),
			getTokenInfo(userClient, toToken.token)
		])

		// Step 2: Calculate exchange rate
		logger?.debug(`Calculating exchange rate for ${fromTokenInfo.name} -> ${toTokenInfo.name}`)
		let rate = calculateExchangeRate(fromTokenInfo.name, toTokenInfo.name)

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
		const balance = new Numeric(await getTokenBalance(userClient, toToken.token))
		logger?.debug(`Balance for ${request.to}: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}`)

		const requestedAmount = Numeric.fromDecimalString(toAmount, toTokenInfo.decimalPlaces, true)
		logger?.debug(`Requested amount: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`)

		if (balance.valueOf() < requestedAmount.valueOf()) {
			throw(new AppError(`Insufficient balance. Available: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}, Required: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`));
		}

		// Step 5: Calculate expected cost (network fees, processing fees)
		const baseFee = userClient.baseToken.comparePublicKey(fromToken.token) ? "0.00001" : "0.00002"

		const expectedCost = {
			min: baseFee,
			max: Numeric.fromDecimalString(request.amount.mul(0.0005).toString(), 9, true).toDecimalString(9, true, true), // Max 0.05% of transaction
			token: userClient.baseToken.publicKeyString.get()
		}

		// Step 6: Return the result with original request echoed back
		return(c.json({
			ok: true,
			estimate: {
				request: {
					from: request.from,
					to: request.to,
					amount: request.amount.toString(),
					affinity: request.affinity
				},
				convertedAmount,
				expectedCost
			}
		}));
	})

	/**
	 * Create a quote for a token swap
	 */
	.post("/getQuote", validator("json", (i: CreateQuoteSchema) => v.parse(createQuoteSchema, i)), async c => {
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		// const fxClient = c.get("fxClient")
		const userClient = c.get("userClient")
		const logger = c.get("log")

		// Step 1: Look up the token information for both currencies
		logger?.debug(`Creating quote for ${request.from} -> ${request.to}`)

		// const [fromToken, toToken] = await Promise.all([
		// 	// eslint-disable-next-line
		// 	fxClient.resolver.lookupToken(request.from as any),
		// 	// eslint-disable-next-line
		// 	fxClient.resolver.lookupToken(request.to as any)
		// ])
		const fromToken = { token: request.from }
		const toToken = { token: request.to }

		if (!fromToken || !toToken) {
			throw(new AppError(`Currency ${!fromToken ? request.from : request.to} not found`));
		}

		const [fromTokenInfo, toTokenInfo] = await Promise.all([
			getTokenInfo(userClient, fromToken.token),
			getTokenInfo(userClient, toToken.token)
		])

		// Step 2: Calculate exchange rate
		logger?.debug(`Calculating exchange rate for ${fromTokenInfo.name} -> ${toTokenInfo.name}`)
		let rate = calculateExchangeRate(fromTokenInfo.name, toTokenInfo.name)

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
		const balance = new Numeric(await getTokenBalance(userClient, toToken.token, true))
		logger?.debug(`Balance for ${request.to}: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}`)

		const requestedAmount = Numeric.fromDecimalString(toAmount, toTokenInfo.decimalPlaces, true)
		logger?.debug(`Requested amount: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`)

		if (balance.valueOf() < requestedAmount.valueOf()) {
			throw(new AppError(`Insufficient balance. Available: ${balance.toDecimalString(toTokenInfo.decimalPlaces)}, Required: ${requestedAmount.toDecimalString(toTokenInfo.decimalPlaces)}`));
		}

		// Step 5: Calculate actual cost (network fees, processing fees)
		const baseFee = userClient.baseToken.comparePublicKey(fromToken.token) ? "0.00001" : "0.00002"
		const randomProcessingFee = (Math.random() * (0.00005 - 0.00001) + 0.00001).toFixed(6) // Random between 0.001% and 0.005% of transaction
		const processingFee = request.amount.mul(randomProcessingFee).toString() // 0.005% of transaction
		const actualCostAmount = Numeric.fromDecimalString(baseFee, 9, true).valueOf() + Numeric.fromDecimalString(processingFee, 9, true).valueOf()

		// Step 6: Generate quote signature data
		const timestamp = (new Date()).toISOString()
		const nonce = crypto.randomUUID()

		// In a real implementation, this would be signed with a private key
		// For demo purposes, we're using an empty signature
		const signature = ""

		// Step 7: Return the quote with original request echoed back
		return(c.json({
			ok: true,
			quote: {
				request: {
					from: request.from,
					to: request.to,
					amount: request.amount.toString(),
					affinity: request.affinity
				},
				account: userClient.account.publicKeyString.get(),
				convertedAmount,
				signed: {
					nonce,
					timestamp,
					signature
				},
				cost: {
					amount: new Numeric(actualCostAmount).toDecimalString(9, true, true),
					token: userClient.baseToken.publicKeyString.get()
				}
			}
		}));
	})

	/**
	 * Execute a token swap
	 */
	.post("/createExchange", validator("json", (i: ExecuteExchangeSchema) => v.parse(executeExchangeSchema, i)), async c => {
		// Get the parsed request data.
		const { request } = c.req.valid("json")
		const userClient = c.get("userClient")

		// Step 1: Validate quote and Signature
		// XXX:TODO: Implement validation logic

		// Step 2: Get the SWAP Block
		// Get the block buffer from the URL-safe base64 string
		const blockBuffer = urlSafeBase64ToBinary(request.block).buffer

		// Create a new block instance
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const block = new KeetaNet.lib.Block(blockBuffer as ArrayBuffer)

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
		await userClient.client.transmit([computedSendBlock, block], {
			generateFeeBlock: userClient.config.generateFeeBlock
		})

		// Clear balance cache for the token being swapped to
		clearBalanceCache(request.quote.request.to);

		return(c.json({
			ok: true,
			exchangeID: computedSendBlock.hash.toString()
		}));
	})

	/**
	 * Get the status of a token swap
	 */
	.get("/getExchangeStatus/:exchangeID", validator("param", (i: GetExchangeStatusParamSchema) => v.parse(getExchangeStatusParamSchema, i)), async c => {
		return(c.json({
			ok: true,
			exchangeID: c.req.valid("param").exchangeID
		}));
	})

export default app
export type AppSchema = typeof app
