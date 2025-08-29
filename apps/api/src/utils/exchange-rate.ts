// Exchange rate calculation function - can be mocked in tests
export const calculateExchangeRate = (fromCurrency: string, toCurrency: string): number => {
	const mockRates = {
		'USD-EUR': 0.85,
		'EUR-USD': 1.18,
		'USD-BTC': 0.000023,
		'BTC-USD': 43000
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const rateKey = `${fromCurrency}-${toCurrency}` as keyof typeof mockRates
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const reverseRateKey = `${toCurrency}-${fromCurrency}` as keyof typeof mockRates

	return(mockRates[rateKey] || (1 / (mockRates[reverseRateKey] || 1)));
}
