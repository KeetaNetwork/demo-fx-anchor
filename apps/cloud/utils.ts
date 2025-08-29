import * as components from '@keetanetwork/pulumi-components';
import * as crypto from 'crypto';

/**
 * Get the first letter of a string
 */
export function getPrefixHash(data: string, length = 20, addPrefix: boolean | string = true) {
	const hash = crypto.createHash('sha1');

	hash.update(data);

	const digest = hash.digest('hex');

	let hashPrefix = '';
	if (addPrefix === true) {
		const letterMatches = digest.match(/[A-Za-z]/g);
		const firstChar = (letterMatches ?? ['a'])[0];

		hashPrefix = firstChar;
	} else if (typeof addPrefix === 'string') {
		hashPrefix = addPrefix;
	}

	const combined = `${hashPrefix}${digest}`;
	const sub = combined.substring(0, length);

	return(sub.toLowerCase());
}

/**
 * Create a resource name that fits within a defined length.
 * It will be constructed by hashing the prefix, then including as much of it
 * can as well as 6 characters of the hash, and the entire suffix
 */
export function generateName(prefix: string, suffix: string, maxLength: number) {
	prefix = components.utils.normalizeName(prefix);
	const prefixMaxLength = maxLength - suffix.length - 1;

	let realPrefix: string = prefix;
	if (realPrefix.length > prefixMaxLength) {
		realPrefix = realPrefix.slice(0, prefixMaxLength - 1 - 6) + getPrefixHash(realPrefix, 6, false);
	}

	return(`${realPrefix}-${suffix}`);
}
