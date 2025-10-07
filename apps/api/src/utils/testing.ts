import { KeetaNet } from "@keetanetwork/anchor";
import * as Anchor from "@keetanetwork/anchor";
import type { Logger } from '@keetanetwork/anchor/lib/log';
import { expect } from "vitest";

const logOptions = { currentRequestInfo: { id: "TEST-SETUP" }}

/**
 * Builds the token blocks for a given user client builder.
 */
async function buildTokenBlocks(builder: ReturnType<KeetaNet.UserClient['initBuilder']>, decimalPlaces: number, supply: bigint, currencyCode: string) {
	// Create Token
	const pendingTokenAccount = builder.generateIdentifier(KeetaNet.lib.Account.AccountKeyAlgorithm.TOKEN)

	// Compute blocks to create token account
	await builder.computeBlocks()

	// Getting token account
	const tokenAccount = pendingTokenAccount.account

	// Setting token permission as public
	builder.setInfo({
		name: currencyCode,
		description: currencyCode,
		metadata: btoa(JSON.stringify({ decimalPlaces })),
		defaultPermission: new KeetaNet.lib.Permissions(['ACCESS'])
	}, { account: tokenAccount })

	// Adding token supply to user account
	builder.modifyTokenSupply(supply, { account: tokenAccount })

	return(tokenAccount);
}

async function requestTokensFromFaucet(publicKey: string, logger?: Logger) {
	logger?.debug(logOptions, "requestTokensFromFaucet", `Requesting tokens from faucet (publicKey = ${publicKey})`)
	const response = await fetch('https://faucet.test.keeta.com/', {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: `address=${publicKey}&amount=10`
	});

	if (!response.ok) {
		throw(new Error(`Error to request tokens from faucet (publicKey = ${publicKey})`));
	}

	const body = await response.text()
	if (!body.includes(`Sent 10.000000000 KTA to ${publicKey}`)) {
		logger?.warn(logOptions, "requestTokensFromFaucet", `Faucet response was successful, but didn't find 'Sent 10.000000000 KTA...' on response body (publicKey = ${publicKey})`)
	} else {
		logger?.debug(logOptions, "requestTokensFromFaucet", `Faucet requested successfully (publicKey = ${publicKey})`)
	}
}

async function waitUntilHaveBaseToken(userClient: InstanceType<typeof Anchor.KeetaNet.UserClient>, logger?: Logger) {
	logger?.debug(logOptions, "waitUntilHaveBaseToken", `Wait for base token (publicKey = ${userClient.account.publicKeyString.get()})`)

	let balance: bigint
	do {
		balance = await userClient.balance(userClient.baseToken)
		await new Promise(r => setTimeout(r, 300))
	} while (balance === 0n);
}

export async function setup(logger?: Logger) {
	/**
	 * Setup FX Provider
	 */
	const fxSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const fxAccount = KeetaNet.lib.Account.fromSeed(fxSeed, 0)
	logger?.log(logOptions, "fxAccount", fxAccount.publicKeyString.get());
	const fxUserClient = KeetaNet.UserClient.fromNetwork('test', fxAccount)

	// Request tokens for Fees 10_000000000
	await requestTokensFromFaucet(fxAccount.publicKeyString.get(), logger)
	await waitUntilHaveBaseToken(fxUserClient, logger);

	/**
	 * Setup Liquidity Provider
	 */
	const lpSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const lpAccount = KeetaNet.lib.Account.fromSeed(lpSeed, 0)
	logger?.log(logOptions, "lpAccount", lpAccount.publicKeyString.get());
	const lpUserClient = KeetaNet.UserClient.fromNetwork('test', lpAccount);

	// Send tokens for Fees 1_000000000 (balance = 9_000000000)
	await fxUserClient.send(lpAccount, 1_000000000n, fxUserClient.baseToken);

	// Create tokens
	const createTokensBuilder = lpUserClient.initBuilder();
	const currencyUSD = await buildTokenBlocks(createTokensBuilder, 2, 1_000_000_000_00n, "USD"); // 1,000,000,000.00
	const currencyEUR = await buildTokenBlocks(createTokensBuilder, 2, 1_000_000_000_00n, "EUR"); // 1,000,000,000.00
	const currencyMXN = await buildTokenBlocks(createTokensBuilder, 2, 1_000_000_000_00n, "MXN"); // 1,000,000,000.00
	const currencyBTC = await buildTokenBlocks(createTokensBuilder, 8, 1_000_00000000n, "BTC"); // 1,000.00000000
	await lpUserClient.publishBuilder(createTokensBuilder);

	// Send tokens to FX account
	const distributeTokensBuilder = lpUserClient.initBuilder();
	distributeTokensBuilder.send(fxAccount, 500_000_000_00n, currencyUSD, undefined, { account: currencyUSD });
	distributeTokensBuilder.send(fxAccount, 500_000_000_00n, currencyEUR, undefined, { account: currencyEUR });
	distributeTokensBuilder.send(fxAccount, 500_000_000_00n, currencyMXN, undefined, { account: currencyMXN });
	distributeTokensBuilder.send(fxAccount, 500_00000000n, currencyBTC, undefined, { account: currencyBTC });
	await lpUserClient.publishBuilder(distributeTokensBuilder);

	return({
		fxAccount,
		fxUserClient,

		lpAccount,
		lpUserClient,

		tokens: {
			USD: currencyUSD,
			EUR: currencyEUR,
			MXN: currencyMXN,
			'$BTC': currencyBTC
		}
	});
}

export async function setupResolver(baseURL: string, fxUserClient: InstanceType<typeof Anchor.KeetaNet.UserClient>, tokens: Awaited<ReturnType<typeof setup>>['tokens'], logger?: Logger) {
	/**
	 * Setup resolver
	 */
	const resolverSeed = KeetaNet.lib.Account.generateRandomSeed({ asString: true });
	const resolverAccount = KeetaNet.lib.Account.fromSeed(resolverSeed, 0)
	logger?.log(logOptions, "resolverAccount", resolverAccount.publicKeyString.get());
	const resolverUserClient = KeetaNet.UserClient.fromNetwork('test', resolverAccount)

	// Send tokens for Fees 1_000000000 (balance = 8_000000000)
	await fxUserClient.send(resolverAccount, 1_000000000n, fxUserClient.baseToken);

	await resolverUserClient.setInfo({
		description: 'FX Anchor Test Root',
		name: 'TEST',
		metadata: Anchor.lib.Resolver.Metadata.formatMetadata({
			version: 1,
			currencyMap: {
				USD: tokens.USD.publicKeyString.get(),
				EUR: tokens.EUR.publicKeyString.get(),
				MXN: tokens.MXN.publicKeyString.get(),
				'$BTC': tokens['$BTC'].publicKeyString.get()
			},
			services: {
				fx: {
					Test: {
						from: [{
							currencyCodes: [
								tokens.USD.publicKeyString.get(),
								tokens.EUR.publicKeyString.get(),
								tokens.MXN.publicKeyString.get(),
								tokens.$BTC.publicKeyString.get()
							],
							to: [
								tokens.USD.publicKeyString.get(),
								tokens.EUR.publicKeyString.get(),
								tokens.MXN.publicKeyString.get(),
								tokens.$BTC.publicKeyString.get()
							]
						}],
						operations: {
							getEstimate: `${baseURL}/api/getEstimate`,
							getQuote: `${baseURL}/api/getQuote`,
							createExchange: `${baseURL}/api/createExchange`,
							getExchangeStatus: `${baseURL}/api/getExchangeStatus/:id`
						}
					}
				}
			}
		})
	});

	return({
		resolverAccount,
		resolverUserClient
	});
}

export function expectNonNullable<T>(value: T): asserts value is NonNullable<T> {
	expect(value).not.toBeNull()
}
