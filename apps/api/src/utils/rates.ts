import Decimal from "decimal.js";

interface ExchangeRate {
	currencyCode: string;
	rate: bigint;
}

export const ratePrecision = 16

export const rateFactor = 10 ** ratePrecision

// Rates using 16 decimal places
const USDRates: ExchangeRate[] = [
	{
		'currencyCode': 'KTA',
		'rate': BigInt(new Decimal(1.3).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'BTC',
		'rate': BigInt(new Decimal(125341.4).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'CBBTC',
		'rate': BigInt(new Decimal(125341.4).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'USDC',
		'rate': BigInt(new Decimal(1).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'CAD',
		'rate': BigInt(new Decimal(1.395).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'GBP',
		'rate': BigInt(new Decimal(0.7453).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'MXN',
		'rate': BigInt(new Decimal(18.4).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'EUR',
		'rate': BigInt(new Decimal(0.8581).mul(rateFactor).toFixed(0))
	},
	{
		'currencyCode': 'BRL',
		'rate': BigInt(new Decimal(5.65).mul(rateFactor).toFixed(0))
	}
];

async function getSupportedCurrencies(): Promise<string[]> {
	return(USDRates.map(function(rate) { return(rate.currencyCode); }).concat(['USD']));
}

// Get the exchange rates to all available currencies from the anchor currency
export async function getRates(anchorCurrencyCode: string): Promise<ExchangeRate[]> {
	if (anchorCurrencyCode === 'USD') {
		return(USDRates);
	}

	const anchorUSDRate = USDRates.find(function(rate) { return(rate.currencyCode === anchorCurrencyCode); });

	if (!anchorUSDRate) {
		throw(new Error('Currency Not Supported'));
	}

	const rates: ExchangeRate[] = [];
	const supportedCurrencies = await getSupportedCurrencies();

	for (const currency of supportedCurrencies) {
		// Exclude anchorCurrency from rates list
		if (currency === anchorCurrencyCode) {
			continue;
		}
		const usdRate = BigInt(new Decimal(rateFactor).mul(rateFactor).div(anchorUSDRate.rate).toFixed(0));
		// const usdRate = BigInt(rateFactor) * BigInt(rateFactor) / anchorUSDRate.rate;

		// Rates list is for USD so return inverse of USD rate
		if (currency === 'USD') {
			rates.push({
				currencyCode: currency,
				rate: usdRate
			});
			continue;
		}

		// Get the other pair's USD Rate
		const pairUSDRate = USDRates.find(function(rate) { return(rate.currencyCode === currency); });
		if (!pairUSDRate) {
			throw(new Error(`Currency Pair ${currency} Not Supported`));
		}
		rates.push({
			currencyCode: currency,
			// Multiply inverse of USD rate and other pairs USD rate to get exchange rate
			rate: BigInt(new Decimal(pairUSDRate.rate).mul(usdRate).div(rateFactor).toFixed(0))
		});
	}

	return(rates);
}

/**
 * Get a single exchange rate.
 *
 * If fromCurrencyCode and toCurrencyCode are the same, return the rate as 1.
 */
export async function getExchangeRate(fromCurrencyCode: string, toCurrencyCode: string): Promise<ExchangeRate> {
	if (fromCurrencyCode === toCurrencyCode) {
		return({
			currencyCode: toCurrencyCode,
			rate: 1_00000000n
		});
	}

	const rates = await getRates(fromCurrencyCode);
	const toCurrencyRate = rates.find(function(rate) {
		return(rate.currencyCode === toCurrencyCode);
	});

	if (!toCurrencyRate) {
		throw(new Error(`Rate not supported for currency: ${toCurrencyCode}`));
	}

	return({
		currencyCode: toCurrencyCode,
		rate: toCurrencyRate.rate
	});
}

export function scaleDecimals(value: bigint, fromDecimalPlaces: number, toDecimalPlaces: number) {
	if (!Number.isInteger(fromDecimalPlaces) || !Number.isInteger(toDecimalPlaces)) {
		throw(new Error("Decimal places MUST be integer"));
	}

	if (fromDecimalPlaces === toDecimalPlaces) {
		return(value);
	}

	const difference = toDecimalPlaces - fromDecimalPlaces
	if (difference > 0) {
		// Increase decimal places: multiply by 10^(difference)
		const factor = BigInt(10) ** BigInt(difference)
		return(value * factor);
	} else {
		// Decrease decimal places: divide by 10^(difference) with rounding
		const factor = BigInt(10) ** BigInt(-difference)
		const adjustedValue = value >= 0n ? value + factor / 2n : value - factor / 2n
		return(adjustedValue / factor);
	}
}

export function calculateConvertedAmount(amount: bigint, rate: bigint, affinityDecimalPlaces: number, convertedDecimalPlaces: number): bigint {
	const calcPrecision = ratePrecision

	const scaledRate = scaleDecimals(rate, ratePrecision, calcPrecision)
	const scaledAmount = scaleDecimals(amount, affinityDecimalPlaces, calcPrecision)

	const converted = BigInt(new Decimal(scaledAmount).mul(rateFactor).div(scaledRate).toFixed(0))
	const convertedAmount = scaleDecimals(converted, calcPrecision, convertedDecimalPlaces)
	return(convertedAmount);
}
