import * as v from 'valibot';
import Decimal from 'decimal.js';

const requiredString = v.pipe(v.string("Required"), v.minLength(1, "Required"))

export const getEstimateSchema = v.object({
	request: v.object({
		from: requiredString,
		to: requiredString,
		amount: v.pipe(v.union([requiredString, v.number()]), v.transform(i => new Decimal(i)), v.check(i => i.greaterThan(0), "Must be greater than 0")),
		affinity: v.pipe(requiredString, v.picklist(['from', 'to']))
	})
});
export type GetEstimateSchema = v.InferInput<typeof getEstimateSchema>;

export const createQuoteSchema = getEstimateSchema
export type CreateQuoteSchema = v.InferInput<typeof createQuoteSchema>;

export const executeExchangeSchema = v.object({
	request: v.object({
		block: requiredString,
		quote: v.object({
			request: getEstimateSchema.entries.request,
			account: requiredString,
			convertedAmount: requiredString,
			cost: v.object({
				amount: requiredString,
				token: requiredString
			}),
			signed: v.object({
				timestamp: requiredString,
				nonce: requiredString,
				signature: v.string()
			})
		})
	})
})
export type ExecuteExchangeSchema = v.InferInput<typeof executeExchangeSchema>;

export const getExchangeStatusParamSchema = v.object({
	exchangeID: requiredString
});
export type GetExchangeStatusParamSchema = v.InferInput<typeof getExchangeStatusParamSchema>;
