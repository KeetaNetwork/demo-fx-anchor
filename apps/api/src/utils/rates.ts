import Decimal from "decimal.js";

interface ExchangeRate {
	currencyCode: string;
	rate: Decimal;
}

const USDRates: ExchangeRate[] = [
	{
		'currencyCode': 'KTA',
		'rate': new Decimal("1.1363636364")
	},
	{
		'currencyCode': 'BTC',
		'rate': new Decimal("122000")
	},
	{
		'currencyCode': 'CBBTC',
		'rate': new Decimal("122000")
	},
	{
		'currencyCode': 'USDC',
		'rate': new Decimal("1.00")
	},
	{
		'currencyCode': 'CAD',
		'rate': new Decimal("1.3950")
	},
	{
		'currencyCode': 'GBP',
		'rate': new Decimal("0.7453")
	},
	{
		'currencyCode': 'MXN',
		'rate': new Decimal("18.40")
	},
	{
		'currencyCode': 'EUR',
		'rate': new Decimal("0.8581")
	},
	{
		'currencyCode': 'BRL',
		'rate': new Decimal("5.65")
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
		const usdRate = new Decimal(1).div(anchorUSDRate.rate);

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
			rate: pairUSDRate.rate.mul(usdRate)
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
			rate: new Decimal(1)
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
