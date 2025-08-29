/**
 * Converts a binary string to URL-safe Base64 format.
 * This format is safe for use in URLs, file names, and JSON without escaping.
 */
export function safeBase64Encode(data: string): string {
	// First encode to standard Base64
	const base64 = btoa(data)

	// Then convert to URL-safe Base64
	return(base64
		.replace(/\+/g, "-") // Replace + with -
		.replace(/\//g, "_") // Replace / with _
		.replace(/=+$/, "")); // Remove trailing = padding
}

/**
 * Decodes a URL-safe Base64 string back to a binary string.
 */
export function safeBase64Decode(urlSafe: string): string {
	// Calculate required padding
	const padding = urlSafe.length % 4
	const paddingNeeded = padding ? 4 - padding : 0

	// Convert back to standard Base64
	const base64 =
		urlSafe
			.replace(/-/g, "+") // Replace - with +
			.replace(/_/g, "/") + // Replace _ with /
		"=".repeat(paddingNeeded) // Add padding

	// Decode from Base64 to binary string
	return(atob(base64));
}

/**
 * Converts a Uint8Array to a URL-safe Base64 string.
 *
 * @param {Uint8Array} data - Binary data to encode
 * @returns {string} URL-safe Base64 encoded string
 */
export function binaryToUrlSafeBase64(data: Uint8Array): string {
	// Convert binary data to string
	const binaryString = Array.from(data)
		.map(byte => String.fromCharCode(byte))
		.join("")

	// Encode using the string function
	return(safeBase64Encode(binaryString));
}

/**
 * Converts a URL-safe Base64 string back to a Uint8Array.
 *
 * @param {string} urlSafe - URL-safe Base64 encoded string
 * @returns {Uint8Array} Decoded binary data
 */
export function urlSafeBase64ToBinary(urlSafe: string): Uint8Array {
	// Decode to binary string
	const binaryString = safeBase64Decode(urlSafe)

	// Convert to Uint8Array
	const result = new Uint8Array(binaryString.length)
	for (let i = 0; i < binaryString.length; i++) {
		result[i] = binaryString.charCodeAt(i)
	}

	return(result);
}
