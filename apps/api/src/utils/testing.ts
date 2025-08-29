import { KeetaNet } from "@keetanetwork/anchor";
import * as Anchor from "@keetanetwork/anchor";

/**
 * Builds the token blocks for a given user client builder.
 */
async function buildTokenBlocks(builder: ReturnType<KeetaNet.UserClient['initBuilder']>, decimalPlaces: number, supply: bigint) {
	// Create Token
	const pendingTokenAccount = builder.generateIdentifier(KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN)

	// Compute blocks to create token account
	await builder.computeBlocks()

	// Getting token account
	const tokenAccount = pendingTokenAccount.account

	// Setting token permission as public
	builder.setInfo({
		name: "",
		description: "",
		metadata: btoa(JSON.stringify({ decimalPlaces })),
		defaultPermission: new KeetaNet.lib.Permissions(['ACCESS'])
	}, { account: tokenAccount })

	// Adding token supply to user account
	builder.modifyTokenSupply(supply, { account: tokenAccount })

	return(tokenAccount);
}

export async function setup() {
	/**
	 * Setup FX Provider
	 */
	const fxSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const fxAccount = KeetaNet.lib.Account.fromSeed(fxSeed, 0)
	console.log("fxAccount =", fxAccount.publicKeyString.get());
	const fxUserClient = KeetaNet.UserClient.fromNetwork('test', fxAccount)

	/**
	 * Setup Liquidity Provider
	 */
	const lpSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const lpAccount = KeetaNet.lib.Account.fromSeed(lpSeed, 0)
	console.log("lpAccount =", lpAccount.publicKeyString.get());
	const lpUserClient = KeetaNet.UserClient.fromNetwork('test', lpAccount);

	// Create tokens
	const createTokensBuilder = lpUserClient.initBuilder();
	const currencyUSD = await buildTokenBlocks(createTokensBuilder, 2, 1_000_000_000_00n); // 1,000,000,000.00
	const currencyEUR = await buildTokenBlocks(createTokensBuilder, 2, 1_000_000_000_00n); // 1,000,000,000.00
	const currencyBTC = await buildTokenBlocks(createTokensBuilder, 8, 1_000_00000000n); // 1,000.00000000
	await lpUserClient.publishBuilder(createTokensBuilder);

	// Send tokens to FX account
	const distributeTokensBuilder = lpUserClient.initBuilder();
	distributeTokensBuilder.send(fxAccount, 500_000_000_00n, currencyUSD, undefined, { account: currencyUSD });
	distributeTokensBuilder.send(fxAccount, 500_000_000_00n, currencyEUR, undefined, { account: currencyEUR });
	distributeTokensBuilder.send(fxAccount, 500_00000000n, currencyBTC, undefined, { account: currencyBTC });
	await lpUserClient.publishBuilder(distributeTokensBuilder);

	/**
	 * Setup resolver
	 */
	const resolverSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const resolverAccount = KeetaNet.lib.Account.fromSeed(resolverSeed, 0)
	console.log("resolverAccount =", resolverAccount.publicKeyString.get());
	const resolverUserClient = KeetaNet.UserClient.fromNetwork('test', resolverAccount)

	await resolverUserClient.setInfo({
		description: 'FX Anchor Test Root',
		name: 'TEST',
		metadata: Anchor.lib.Resolver.Metadata.formatMetadata({
			version: 1,
			currencyMap: {
				USD: currencyUSD.publicKeyString.get(),
				EUR: currencyEUR.publicKeyString.get(),
				'$BTC': currencyBTC.publicKeyString.get()
			},
			services: {
				fx: {
					Test: {
						from: [{
							currencyCodes: [currencyUSD.publicKeyString.get()],
							to: [currencyEUR.publicKeyString.get()]
						}],
						operations: {
							getEstimate: "/anchor/getEstimate",
							getQuote: "/anchor/createQuote",
							createExchange: "/anchor/executeExchange",
							getExchangeStatus: "/anchor/getExchangeStatus/:blockhash"
						}
					}
				}
			}
		})
	});

	return({
		fxAccount,
		fxUserClient,

		lpAccount,
		lpUserClient,

		resolverAccount,
		resolverUserClient,

		tokens: {
			USD: currencyUSD,
			EUR: currencyEUR,
			'$BTC': currencyBTC
		}
	});
}
