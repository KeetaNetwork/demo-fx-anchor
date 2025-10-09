import { describe, expect, it } from "vitest";
import { calculateConvertedAmount, getExchangeRate, rateFactor, scaleDecimals } from "./rates";
import Decimal from "decimal.js";

describe("Rates", () => {

	it("getExchangeRate", async () => {
		const rateKTA2USD = await getExchangeRate("KTA", "USD")
		const rateUSD2BTC = await getExchangeRate("USD", "BTC")

		expect(rateKTA2USD.rate).toBe(7692307692307692n) // 0.7692307692307692
		expect(rateUSD2BTC.rate).toBe(125341_4000000000000000n) // 125,341.4

		const resultingRate = BigInt(new Decimal(rateKTA2USD.rate).mul(rateUSD2BTC.rate).div(rateFactor).toFixed(0))
		const rateKTA2BTC = await getExchangeRate("KTA", "BTC")

		expect(resultingRate).toBe(rateKTA2BTC.rate)

		const rateUSD2KTA = await getExchangeRate("USD", "KTA")
		expect(rateUSD2KTA.rate).toBe(BigInt(rateFactor) * BigInt(rateFactor) / rateKTA2USD.rate)
	})

	it("scaleDecimals", () => {
		// Same decimal places
		expect(scaleDecimals(10_0000n, 4, 4)).toBe(10_0000n) // 10.0000

		// Scale UP
		expect(scaleDecimals(10_0000n, 4, 10)).toBe(10_0000000000n) // 10.0000 -> 10.0000000000
		expect(scaleDecimals(-10_0000n, 4, 10)).toBe(-10_0000000000n) // -10.0000 -> -10.0000000000
		expect(scaleDecimals(1000n, 4, 10)).toBe(1000000000n) // 0.1000 -> 0.1000000000

		// Scale DOWN
		expect(scaleDecimals(10_0000000000n, 10, 4)).toBe(10_0000n) // 10.0000000000 -> 10.0000
		expect(scaleDecimals(-10_0000000000n, 10, 4)).toBe(-10_0000n) // -10.0000000000 -> -10.0000
		expect(scaleDecimals(1000000000n, 10, 4)).toBe(1000n) // 0.1000000000 -> 0.1000
	})

	it("calculateConvertedAmount", async () => {
		/**
		 * USD <-> EUR
		 */
		const rateUSD2EUR = await getExchangeRate("USD", "EUR") // 0.8581
		const rateEUR2USD = await getExchangeRate("EUR", "USD") // 1.16536534

		// Using 2 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2EUR.rate, 2, 2)).toBe(11_65n)
		expect(calculateConvertedAmount(11_65n, rateEUR2USD.rate, 2, 2)).toBe(10_00n)

		// Using from 2 decimals to 8 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2EUR.rate, 2, 8)).toBe(11_65365342n)
		expect(calculateConvertedAmount(11_65365342n, rateEUR2USD.rate, 8, 2)).toBe(10_00n)

		/**
		 * USD <-> BTC
		 */
		const rateUSD2BTC = await getExchangeRate("USD", "BTC") // 125341,4
		const rateBTC2USD = await getExchangeRate("BTC", "USD") // 0,00000798

		// Using from 2 decimals to 8 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2BTC.rate, 2, 8)).toBe(7978n) // 10 -> 0.00007978
		expect(calculateConvertedAmount(7978n, rateBTC2USD.rate, 8, 2)).toBe(10_00n) // 0.00007978 -> 9.99749373
	})
})
