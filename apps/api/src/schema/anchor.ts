import * as v from 'valibot';
import * as KeetaNetAnchor from '@keetanetwork/anchor';
import * as CurrencyInfo from '@keetanetwork/currency-info';
import Decimal from 'decimal.js';

const { KeetaNet } = KeetaNetAnchor;

const currencies = CurrencyInfo.Currency.allCurrencyCodes;

const currencySchema = v.pipe(v.string(), v.picklist(currencies));
const requiredString = v.pipe(v.string("Required"), v.minLength(1, "Required"))

export const getEstimateSchema = v.object({
	request: v.object({
		from: currencySchema,
		to: currencySchema,
		amount: v.pipe(v.union([requiredString, v.number()]), v.transform(i => new Decimal(i)), v.check(i => i.greaterThan(0), "Must be greater than 0")),
		affinity: v.pipe(requiredString, v.picklist(['from', 'to']))
	})
});

export const getQuoteSchema = getEstimateSchema

export const createExchangeSchema = v.object({
	request: v.object({
		...getEstimateSchema.entries.request.entries,
		signature: v.object({
			timestamp: requiredString,
			nonce: requiredString,
			signature: requiredString
		})
	})
})

export const getExchangeStatusParamSchema = v.object({
	blockhash: v.pipe(v.string(), v.check(i => !!(new KeetaNet.lib.Block.Hash(i)).toString(), "Invalid blockhash"))
});
