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

export async function getTokenInfo(userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>, account: InstanceType<typeof Anchor.KeetaNet.lib.Account> | string) {
	const { info } = await userClient.client.getAccountInfo(account)

	return({
		...info,
		...decodeTokenMetadata(info.metadata)
	})
}
