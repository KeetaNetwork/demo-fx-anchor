import * as KeetaNetAnchor from "@keetanetwork/anchor";

function formatSignedData(account: InstanceType<typeof KeetaNetAnchor.KeetaNet.lib.Account>, nonce?: string, timestamp?: string | Date): { nonce: string; timestamp: string; verificationData: Buffer; } {
	nonce ??= crypto.randomUUID();
	timestamp ??= new Date();

	let timestampString: string;
	if (typeof timestamp === 'string') {
		timestampString = timestamp;
	} else {
		timestampString = timestamp.toISOString();
	}

	const signature = new KeetaNetAnchor.KeetaNet.lib.Utils.ASN1.BufferStorageASN1([
		nonce,
		timestampString,
		account.publicKeyAndType
	], [
		{ type: 'string', kind: 'utf8' },
		{ type: 'string', kind: 'utf8' },
		KeetaNetAnchor.KeetaNet.lib.Utils.ASN1.ValidateASN1.IsOctetString
	]);

	return({
		nonce: nonce,
		timestamp: timestampString,
		verificationData: signature.getDERBuffer()
	});
}

// TODO
export async function verifySignedData(request: { account: string; signed: { nonce?: string; timestamp?: string | Date; signature: string; }}): Promise<boolean> {
	const account = KeetaNetAnchor.KeetaNet.lib.Account.toAccount(request.account);
	const nonce = request.signed.nonce;
	const timestamp = request.signed.timestamp;
	const signatureBuffer = Buffer.from(request.signed.signature, 'base64');
	if (Object.keys(request.signed).length !== 3 || !nonce || !signatureBuffer || !timestamp) {
		throw(new Error('Invalid signed data: must contain only nonce, signature, and timestamp'));
	}

	/* XXX:TODO: Verify that the timestamp is a valid ISO 8601 date string within a reasonable range */

	const { verificationData } = formatSignedData(account, nonce, timestamp);

	return(account.verify(KeetaNetAnchor.KeetaNet.lib.Utils.Helper.bufferToArrayBuffer(verificationData), KeetaNetAnchor.KeetaNet.lib.Utils.Helper.bufferToArrayBuffer(signatureBuffer)));
}
