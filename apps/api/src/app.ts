import * as Anchor from "@keetanetwork/anchor";
import { KeetaAnchorUserError } from "@keetanetwork/anchor/lib/error";
import type { KeetaAnchorFXServerConfig } from "@keetanetwork/anchor/services/fx/server";
import type { TokenInfo } from "./utils/network";
import { getTokenInfo } from "./utils/network";
import { calculateConvertedAmount, getExchangeRate } from "./utils/rates";
import type { ServerConfig } from "./server";

const KeetaNet = Anchor.KeetaNet;

/**
 * Parse a user-provided token public key, rejecting malformed keys and
 * non-token accounts with a user error instead of an internal error.
 */
function parseTokenPublicKey(publicKey: string, field: string) {
	try {
		return(KeetaNet.lib.Account.fromPublicKeyString(publicKey).assertKeyType(KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN));
	} catch {
		throw(new KeetaAnchorUserError(`Invalid token public key in "${field}"`));
	}
}

/**
 * Parse a user-provided amount, which must be a positive integer string.
 */
function parseAmount(amount: string) {
	let parsed: bigint;
	try {
		parsed = BigInt(amount);
	} catch {
		throw(new KeetaAnchorUserError("Invalid amount: expected an integer in the token's smallest unit"));
	}

	if (parsed <= 0n) {
		throw(new KeetaAnchorUserError("Invalid amount: must be greater than zero"));
	}

	return(parsed);
}

interface FXHandlerProps extends Pick<ServerConfig, 'userClient' | 'logger' | 'account'> {
	baseTokenInfo: TokenInfo
}

export function createFXHandler({ userClient, logger, account }: FXHandlerProps): KeetaAnchorFXServerConfig['fx'] {

	return({
		getConversionRateAndFee: async function(request) {
			logger?.debug("Request received", request);

			const amount = parseAmount(request.amount);
			const fromToken = parseTokenPublicKey(request.from, 'from');
			const toToken = parseTokenPublicKey(request.to, 'to');

			/**
			 * Select which is the "affinity" token and which is the "converted" token.
			 * This is important to use the right decimalPlaces
			 */
			const affinityToken = request.affinity === 'from' ? fromToken : toToken
			const convertedToken = request.affinity === 'from' ? toToken : fromToken

			/**
			 * Look up the token information for both currencies
			 */
			const [affinityTokenInfo, convertedTokenInfo] = await Promise.all([
				getTokenInfo(userClient, affinityToken),
				getTokenInfo(userClient, convertedToken)
			])

			/**
			 * Calculate converted amount based on affinity
			 */
			logger?.debug(`Calculating exchange rate for ${affinityTokenInfo.currencyCode} -> ${convertedTokenInfo.currencyCode}`);
			const { rate } = await getExchangeRate(affinityTokenInfo.currencyCode, convertedTokenInfo.currencyCode);
			logger?.debug(`Base rate: ${rate}`)

			const convertedAmount = calculateConvertedAmount(amount, rate, affinityTokenInfo.decimalPlaces, convertedTokenInfo.decimalPlaces)
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
