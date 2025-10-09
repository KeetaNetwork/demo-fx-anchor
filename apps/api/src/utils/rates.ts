interface ExchangeRate {
	currencyCode: string;
	rate: number;
}

export const precision = 16

export const rateFactor = 10 ** precision

// Rates using 16 decimal places
const USDRates: ExchangeRate[] = [
	{
		'currencyCode': 'KTA',
		'rate': 1.3
	},
	{
		'currencyCode': 'BTC',
		'rate': 0.00000797819973
	},
	{
		'currencyCode': 'CBBTC',
		'rate': 0.00000797819973
	},
	{
		'currencyCode': 'USDC',
		'rate': 1
	},
	{
		'currencyCode': 'CAD',
		'rate': 1.395
	},
	{
		'currencyCode': 'GBP',
		'rate': 0.7453
	},
	{
		'currencyCode': 'MXN',
		'rate': 18.4
	},
	{
		'currencyCode': 'EUR',
		'rate': 0.8581
	},
	{
		'currencyCode': 'BRL',
		'rate': 5.65
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
		// Trim rate to expected precision
		const usdRate = Math.round(rateFactor / anchorUSDRate.rate) / rateFactor;

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
			rate: pairUSDRate.rate * usdRate
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
			rate: 1
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

export function scalePrecision(value: bigint, fromPrecision: number, toPrecision: number) {
	if (!Number.isInteger(fromPrecision) || !Number.isInteger(toPrecision)) {
		throw(new Error("Decimal places MUST be integer"));
	}

	if (fromPrecision === toPrecision) {
		return(value);
	}

	const difference = toPrecision - fromPrecision
	if (difference > 0) {
		// Increase precision places: multiply by 10^(difference)
		const factor = 10n ** BigInt(difference)
		return(value * factor);
	} else {
		// Decrease precision: divide by 10^(difference)
		const factor = 10n ** BigInt(-difference)
		// Adjust for rounding
		const adjustedValue = value >= 0n ? value + factor / 2n : value - factor / 2n
		return(adjustedValue / factor);
	}
}

export function calculateConvertedAmount(amount: bigint, rate: number, affinityPrecision: number, convertedPrecision: number): bigint {
	const scaledAmount = scalePrecision(amount, affinityPrecision, precision)
	const converted = (scaledAmount * BigInt(Math.round(rate * rateFactor))) / BigInt(rateFactor)
	const convertedAmount = scalePrecision(converted, precision, convertedPrecision)
	return(convertedAmount);
}
