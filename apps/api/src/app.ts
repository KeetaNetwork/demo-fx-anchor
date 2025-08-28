import { Hono } from "hono";
import { validator } from "hono/validator";
import { parse } from "valibot";
import * as KeetaNetAnchor from "@keetanetwork/anchor";
import { createExchangeSchema, getEstimateSchema, getExchangeStatusParamSchema, getQuoteSchema } from "./schema/anchor";
import type { ServerEnv } from "./server";

const KeetaNet = KeetaNetAnchor.KeetaNet;

// Check if the request is signed and valid.
// if (!(await verifySignedData(data.request))) {
// 	return(c.json({
// 		ok: false,
// 		error: "Invalid signed data"
// 	}, 400));
// }

const app = new Hono<ServerEnv>()
	/**
	 * Create a new verification request
	 */
	.post("/anchor/getEstimate", validator("json", v => parse(getEstimateSchema, v)), async c => {
		// Get the parsed request data.
		const data = c.req.valid("json")
		const id = crypto.randomUUID()

		const userClient = KeetaNet.UserClient.fromNetwork('test', null)

		return(c.json({
			ok: true,
			estimate: {
				rate: 0,
				amount: "",
				affinity: "from"
			},
			expectedCost: {
				min: "0",
				max: "0",
				token: userClient.baseToken.publicKeyString.toString()
			}
		}));
	})

	/**
	 *
	 */
	.post("/anchor/getQuote", validator("json", v => parse(getQuoteSchema, v)), async c => {
		const userClient = KeetaNet.UserClient.fromNetwork('test', null)
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
				token: userClient.baseToken.publicKeyString.toString()
			}
		}));
	})

	/**
	 *
	 */
	.post("/anchor/createExchange", validator("json", v => parse(createExchangeSchema, v)), async c => {
		return(c.json({
			ok: true,
			blockhash: ""
		}));
	})

	/**
	 *
	 */
	.get("/anchor/getExchangeStatus/:blockhash", validator("param", v => parse(getExchangeStatusParamSchema, v)), async c => {
		return(c.json({
			ok: true,
			blockhash: ""
		}));
	})

export default app
export type AppSchema = typeof app
