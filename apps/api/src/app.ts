import type { KeetaAnchorFXServerConfig } from "@keetanetwork/anchor/services/fx/server";
import { Numeric } from "@keetanetwork/web-ui-utils/helpers/Numeric";
import { getTokenInfo } from "./utils/network";
import { getExchangeRate } from "./utils/rates";
import type { ServerConfig } from "./server";

export function createFXHandler({ userClient, logger, account }: Pick<ServerConfig, 'userClient' | 'logger' | 'account'>): KeetaAnchorFXServerConfig['fx'] {

	return({
		getConversionRateAndFee: async function(request) {
			logger?.debug("Request received", request);

			/**
			 * Look up the token information for both currencies
			 */
			const [fromTokenInfo, toTokenInfo] = await Promise.all([
				getTokenInfo(userClient, request.from),
				getTokenInfo(userClient, request.to)
			])

			/**
			 * Calculate converted amount based on affinity
			 */
			let convertedAmount: string
			if (request.affinity === 'from') {
				// Calculate exchange rate
				logger?.debug(`Calculating exchange rate for ${toTokenInfo.currencyCode} -> ${fromTokenInfo.currencyCode}`);
				const { rate } = await getExchangeRate(toTokenInfo.currencyCode, fromTokenInfo.currencyCode);
				logger?.debug(`Base rate: ${rate}`)

				// Convert the amount
				const requestAmount = new Numeric(request.amount, fromTokenInfo.decimalPlaces)
				const converted = new Numeric(Math.round(Number(requestAmount) * rate.toNumber()), fromTokenInfo.decimalPlaces)
				convertedAmount = converted.convertDecimalPlaces(toTokenInfo.decimalPlaces).toString()
			} else {
				// Calculate exchange rate
				logger?.debug(`Calculating exchange rate for ${fromTokenInfo.currencyCode} -> ${toTokenInfo.currencyCode}`);
				const { rate } = await getExchangeRate(fromTokenInfo.currencyCode, toTokenInfo.currencyCode);
				logger?.debug(`Base rate: ${rate}`)

				// Convert the amount
				const requestAmount = new Numeric(request.amount, toTokenInfo.decimalPlaces)
				const converted = new Numeric(Math.round(Number(requestAmount) * rate.toNumber()), toTokenInfo.decimalPlaces)
				convertedAmount = converted.convertDecimalPlaces(fromTokenInfo.decimalPlaces).toString()
			}

			/**
			 * Calculate cost (network fees, processing fees)
			 * For demo purposes, we set cost to 0
			 */
			const cost = {
				amount: '0',
				token: userClient.baseToken.publicKeyString.get()
			}

			// Return the converted amount and cost
			return({
				account: account.publicKeyString.get(),
				convertedAmount,
				cost
			});
		}
	});
}
