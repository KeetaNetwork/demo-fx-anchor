import type * as Anchor from "@keetanetwork/anchor";

interface Metadata {
	decimalPlaces: number
}

export function decodeTokenMetadata(metadata: string): Metadata {
	const retval: Metadata = {
		decimalPlaces: 0
	}

	try {
		const parsed: unknown = JSON.parse(atob(metadata))
		if (
			parsed &&
			typeof parsed === "object" &&
			"decimalPlaces" in parsed &&
			(typeof parsed.decimalPlaces === "string" || typeof parsed.decimalPlaces === "number")
		) {
			retval.decimalPlaces = Number(parsed.decimalPlaces)
		}
	} catch {
		/* */
	}

	return(retval);
}

interface TokenInfo {
	name: string
	description: string
	decimalPlaces: number
}
const tokensMemCache = new Map<string, TokenInfo>();

export async function getTokenInfo(userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>, account: InstanceType<typeof Anchor.KeetaNet.lib.Account> | string) {
	const cached = tokensMemCache.get(typeof account === "string" ? account : account.publicKeyString.get())
	if (cached) {
		return(cached)
	}

	let tokenInfo: TokenInfo;
	if (userClient.baseToken.comparePublicKey(account)) {
		tokenInfo = {
			name: 'KTA',
			description: 'Keeta',
			decimalPlaces: 9
		}
	} else {
		const { info } = await userClient.client.getAccountInfo(account)
		tokenInfo = {
			...info,
			...decodeTokenMetadata(info.metadata)
		}
	}

	tokensMemCache.set(typeof account === "string" ? account : account.publicKeyString.get(), tokenInfo)
	return(tokenInfo)
}

/**
 * Get balance of a token and cache it for a short period or until the app request to clear it.
 */
const balanceMemCache = new Map<string, { balance: bigint, timestamp: number }>();
const BALANCE_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export async function getTokenBalance(userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>, publicKey: string, forceRefresh = false) {
	const cached = balanceMemCache.get(publicKey);
	if (cached && (Date.now() - cached.timestamp) < BALANCE_CACHE_TTL && !forceRefresh) {
		return(cached.balance);
	}

	const balance = await userClient.balance(publicKey);
	balanceMemCache.set(publicKey, { balance, timestamp: Date.now() });
	return(balance);
}

export function clearBalanceCache(publicKey?: string) {
	if (publicKey) {
		balanceMemCache.delete(publicKey);
	} else {
		balanceMemCache.clear();
	}
}
