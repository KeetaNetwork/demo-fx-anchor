import type { KeetaAnchorFXServerConfig } from "@keetanetwork/anchor/services/fx/server";
import { Numeric } from "@keetanetwork/web-ui-utils/helpers/Numeric";
import type { TokenInfo } from "./utils/network";
import { getTokenInfo } from "./utils/network";
import { getExchangeRate } from "./utils/rates";
import type { ServerConfig } from "./server";

interface FXHandlerProps extends Pick<ServerConfig, 'userClient' | 'logger' | 'account'> {
	baseTokenInfo: TokenInfo
}

export function createFXHandler({ userClient, logger, account, baseTokenInfo }: FXHandlerProps): KeetaAnchorFXServerConfig['fx'] {

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

			// Get the highest decimal places
			const highestDecimalPlaces = Math.max(affinityTokenInfo.decimalPlaces, convertedTokenInfo.decimalPlaces)

			// Convert the amount
			const fixedAmount = new Numeric(request.amount, affinityTokenInfo.decimalPlaces).convertDecimalPlaces(highestDecimalPlaces)
			const fixedRate = Numeric.fromDecimalString(rate.toString(), highestDecimalPlaces)

			const converted = fixedAmount.valueOf() * fixedRate.valueOf() / BigInt(10 ** highestDecimalPlaces)
			const convertedAmount = new Numeric(converted, highestDecimalPlaces).convertDecimalPlaces(convertedTokenInfo.decimalPlaces)
			logger?.debug("Converted:", convertedAmount.toDecimalString())

			if (convertedAmount.valueOf() <= 0n) {
				throw(new Error("Invalid converted amount"));
			}

			/**
			 * Calculate cost (network fees, processing fees)
			 * For demo purposes, we set cost to 0
			 */
			const cost = {
				amount: Numeric.fromDecimalString('0.000000001', baseTokenInfo.decimalPlaces).toString(),
				token: userClient.baseToken.publicKeyString.get()
			}

			// Return the converted amount and cost
			return({
				account: account.publicKeyString.get(),
				convertedAmount: convertedAmount.toString(),
				cost
			});
		}
	});
}
