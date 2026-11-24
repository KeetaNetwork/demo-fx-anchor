import { KeetaAnchorUserError } from "@keetanetwork/anchor/lib/error";
import type { KeetaAnchorFXServerConfig } from "@keetanetwork/anchor/services/fx/server";
import type { TokenInfo } from "./utils/network";
import { getTokenInfo } from "./utils/network";
import { calculateConvertedAmount, getExchangeRate } from "./utils/rates";
import type { ServerConfig } from "./server";

interface FXHandlerProps extends Pick<ServerConfig, 'userClient' | 'logger' | 'account'> {
	baseTokenInfo: TokenInfo
}

export function createFXHandler({ userClient, logger, account }: FXHandlerProps): KeetaAnchorFXServerConfig['fx'] {

	return({
		getConversionRateAndFee: async function(request) {
			logger?.debug("Request received", request);

			/**
			 * Select which is the "affinity" token and which is the "converted" token.
			 * This is important to use the right decimalPlaces
			 */
			const affinityTokenPublicKey = request.affinity === 'from' ? request.from : request.to
			const convertedTokenPublicKey = request.affinity === 'from' ? request.to : request.from

			/**
			 * Look up the token information for both currencies
			 */
			const [affinityTokenInfo, convertedTokenInfo] = await Promise.all([
				getTokenInfo(userClient, affinityTokenPublicKey),
				getTokenInfo(userClient, convertedTokenPublicKey)
			])

			/**
			 * Calculate converted amount based on affinity
			 */
			logger?.debug(`Calculating exchange rate for ${affinityTokenInfo.currencyCode} -> ${convertedTokenInfo.currencyCode}`);
			const { rate } = await getExchangeRate(affinityTokenInfo.currencyCode, convertedTokenInfo.currencyCode);
			logger?.debug(`Base rate: ${rate}`)

			const convertedAmount = calculateConvertedAmount(BigInt(request.amount), rate, affinityTokenInfo.decimalPlaces, convertedTokenInfo.decimalPlaces)
			logger?.debug("Converted:", convertedAmount)

			if (convertedAmount <= 0n) {
				throw(new KeetaAnchorUserError("Requested amount is too small"));
			}

			/**
			 * Calculate cost (network fees, processing fees)
			 * For demo purposes, we set cost to 0
			 */
			const cost = {
				amount: 0n,
				token: userClient.baseToken
			}

			// Return the converted amount and cost
			return({
				account: account,
				convertedAmount: convertedAmount,
				cost
			});
		}
	});
}
