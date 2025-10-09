import { describe, expect, it } from "vitest";
import { calculateConvertedAmount, getExchangeRate, rateFactor, scalePrecision } from "./rates";

describe("Rates", () => {

	it("getExchangeRate", async () => {
		const rateKTA2USD = await getExchangeRate("KTA", "USD")
		const rateUSD2BTC = await getExchangeRate("USD", "BTC")

		expect(rateKTA2USD.rate).toBe(0.7692307692307692)
		expect(rateUSD2BTC.rate).toBe(0.00000797819973)

		const resultingRate = rateKTA2USD.rate * rateUSD2BTC.rate
		const rateKTA2BTC = await getExchangeRate("KTA", "BTC")

		expect(resultingRate).toBe(rateKTA2BTC.rate)

		const rateUSD2KTA = await getExchangeRate("USD", "KTA")
		expect(rateUSD2KTA.rate).toBe(Math.round((1 / rateKTA2USD.rate) * rateFactor) / rateFactor);
	})

	it("scalePrecision", () => {
		// Same decimal places
		expect(scalePrecision(10_0000n, 4, 4)).toBe(10_0000n) // 10.0000

		// Scale UP
		expect(scalePrecision(10_0000n, 4, 10)).toBe(10_0000000000n) // 10.0000 -> 10.0000000000
		expect(scalePrecision(-10_0000n, 4, 10)).toBe(-10_0000000000n) // -10.0000 -> -10.0000000000
		expect(scalePrecision(1000n, 4, 10)).toBe(1000000000n) // 0.1000 -> 0.1000000000

		// Scale DOWN
		expect(scalePrecision(10_0000000000n, 10, 4)).toBe(10_0000n) // 10.0000000000 -> 10.0000
		expect(scalePrecision(-10_0000000000n, 10, 4)).toBe(-10_0000n) // -10.0000000000 -> -10.0000
		expect(scalePrecision(1000000000n, 10, 4)).toBe(1000n) // 0.1000000000 -> 0.1000
	})

	it("calculateConvertedAmount", async () => {
		/**
		 * USD <-> EUR
		 */
		const rateUSD2EUR = await getExchangeRate("USD", "EUR")
		expect(rateUSD2EUR.rate).toBe(0.8581)
		const rateEUR2USD = await getExchangeRate("EUR", "USD")
		expect(rateEUR2USD.rate).toBe(1.165365342034728)

		// Using 3 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2EUR.rate, 2, 2)).toBe(8_58n)
		expect(calculateConvertedAmount(8_58n, rateEUR2USD.rate, 2, 2)).toBe(10_00n)

		// Using from 2 decimals to 8 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2EUR.rate, 2, 8)).toBe(8_58100000n)
		expect(calculateConvertedAmount(8_58100000n, rateEUR2USD.rate, 8, 2)).toBe(10_00n)

		/**
		 * USD <-> BTC
		 */
		const rateUSD2BTC = await getExchangeRate("USD", "BTC")
		expect(rateUSD2BTC.rate).toBe(0.00000797819973)
		const rateBTC2USD = await getExchangeRate("BTC", "USD")
		expect(rateBTC2USD.rate).toBe(125341.559981226491556)

		// Using from 2 decimals to 8 decimals
		expect(calculateConvertedAmount(10_00n, rateUSD2BTC.rate, 2, 8)).toBe(7978n) // 10 -> 0.00007978
		expect(calculateConvertedAmount(7978n, rateBTC2USD.rate, 8, 2)).toBe(10_00n) // 0.00007978 -> 9.99749373
	})
})
