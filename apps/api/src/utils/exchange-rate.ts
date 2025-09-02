// Exchange rate calculation function - can be mocked in tests
export const calculateExchangeRate = (fromCurrency: string, toCurrency: string): number => {
	const mockRates = {
		'USD-MXN': 20.0,
		'MXN-USD': 0.05,
		'USD-EUR': 0.85,
		'EUR-USD': 1.18,
		'USD-BTC': 0.000023,
		'BTC-USD': 43000,
		'KTA-USD': 1.54,
		'USD-KTA': 0.65,
		'KTA-MXN': 30.8,
		'MXN-KTA': 0.0325,
		'KTA-BTC': 0.000015,
		'BTC-KTA': 65000
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const rateKey = `${fromCurrency}-${toCurrency}` as keyof typeof mockRates
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const reverseRateKey = `${toCurrency}-${fromCurrency}` as keyof typeof mockRates

	return(mockRates[rateKey] || (1 / (mockRates[reverseRateKey] || 1)));
}
