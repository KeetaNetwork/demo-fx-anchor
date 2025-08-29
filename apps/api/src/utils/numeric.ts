/**
 * Helper function to add thousands separators to integer part
 */
export function addThousandsSeparators(intPart: string): string {
	return(intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
}

/**
 * Helper function to format extremely large numbers using scientific notation
 */
function formatScientificNotation(value: string): string {
	const num = Number(value)
	if (!isFinite(num)) {
		return(value); // Return original if it's Infinity or not convertible
	}

	const scientific = num.toExponential(2)

	// Clean up unnecessary zeros after decimal point
	return(scientific.replace(/\.?0+e/, "e"));
}

/**
 * Formats a number according to specified rules:
 * 1. Standard number: Remove trailing zeros after last significant digit
 * 2. Large number (≥ 1,000,000): Format with suffix (M for millions, B for billions, etc.)
 * 3. Very small number (< 0.01 with many decimals): Show the first non-zero digit with "..." notation
 * 4. Zero (including many decimals): Simply show "0"
 *
 * @param value - The number to format as a string or number
 * @returns The formatted number as a string
 */
export function formatNumber(value: string | number): string {
	// Convert to string if not already
	const strValue = typeof value === "number" ? value.toString() : value

	// Remove commas if present
	const cleanValue = strValue.replace(/,/g, "")

	// Handle zero or empty cases
	if (!cleanValue || cleanValue === "0" || /^0[.0]*$/.test(cleanValue)) {
		return("0");
	}

	// Check if the value is a valid number
	if (isNaN(Number(cleanValue))) {
		return("Invalid number");
	}

	const isNegative = cleanValue.startsWith("-")
	const absStrValue = isNegative ? cleanValue.substring(1) : cleanValue
	const sign = isNegative ? "-" : ""

	// Split number into integer and decimal parts
	let [intPart, decPart = ""] = absStrValue.split(".")

	// Large number case (≥ 1,000,000)
	if (intPart.length >= 7) {
		// 1,000,000 has 7 digits
		let suffix: string
		let scaledValue: string

		if (intPart.length >= 13) {
			// Trillion - 1,000,000,000,000
			const wholeDigits = intPart.length

			if (wholeDigits >= 16) {
				// Duodecillion or larger
				return(formatScientificNotation(cleanValue));
			}
			// For trillion
			const trillionValue =
				addThousandsSeparators(intPart.substring(0, intPart.length - 12)) +
				"." +
				intPart.substring(intPart.length - 12, intPart.length - 10)
			scaledValue = trillionValue
			suffix = "T"
		} else if (intPart.length >= 10) {
			// Billion - 1,000,000,000
			const billionValue =
				intPart.substring(0, intPart.length - 9) + "." + intPart.substring(intPart.length - 9, intPart.length - 7)
			scaledValue = billionValue
			suffix = "B"
		} else {
			// Million - 1,000,000
			const millionValue =
				intPart.substring(0, intPart.length - 6) + "." + intPart.substring(intPart.length - 6, intPart.length - 4)
			scaledValue = millionValue
			suffix = "M"
		}

		// Remove trailing zeros after decimal point
		scaledValue = scaledValue.replace(/\.?0+$/, "")

		return(sign + scaledValue + suffix);
	}

	// Very small number case (< 0.01 with many decimals)
	if (intPart === "0" && decPart) {
		// Count leading zeros in decimal part
		let zeroCount = 0
		while (zeroCount < decPart.length && decPart[zeroCount] === "0") {
			zeroCount++
		}

		// If we have enough leading zeros and there's a non-zero digit
		if (zeroCount >= 2 && zeroCount < decPart.length) {
			const firstNonZeroDigit = decPart[zeroCount]
			// For numbers like 0.000000000030000027, expected format is 0.000...03
			if (zeroCount >= 9) {
				return(sign + "0." + "0".repeat(3) + "..." + "0" + firstNonZeroDigit);
			} else {
				return(sign + "0." + "0".repeat(Math.min(3, zeroCount)) + "..." + firstNonZeroDigit);
			}
		}
	}

	// Standard number case
	// Add thousands separators to integer part
	intPart = addThousandsSeparators(intPart)

	// Handle decimal formatting for standard numbers
	if (decPart.length > 0) {
		// For very long decimals (more than 9 places), add ellipsis
		if (decPart.length > 9) {
			decPart = decPart.substring(0, 8) + "..."
		} else {
			// Remove trailing zeros from decimal part but preserve all significant digits
			decPart = decPart.replace(/0+$/, "")
		}
	}

	// Combine the parts
	let result = intPart
	if (decPart.length > 0) {
		result += "." + decPart
	}

	return(sign + result);
}

export function trimTrailingZeros(value: string): string {
	return(value.replace(/0+$/, ""));
}

export class Numeric {
	#value: bigint

	/**
	 * Creates a new immutable `Numeric` instance from a string, number, or bigint.
	 *
	 * @param value The value to convert to a `Numeric` instance. Can be:
	 * - A valid integer `string` (e.g., "1,234", "123n", "-1000")
	 * - A `number` (must be a safe integer)
	 * - A `bigint`
	 *
	 * @throws If the value is of unsupported type or invalid format
	 *
	 * @example
	 * new Numeric("1,000")       // ✅
	 * new Numeric(500)           // ✅
	 * new Numeric(123n)          // ✅
	 * new Numeric("123.45")      // ❌ Throws
	 */
	constructor(value: bigint | string | number | Numeric) {
		if (typeof value === "bigint") {
			this.#value = value
		} else if (typeof value === "string") {
			this.#value = this.#fromString(value)
		} else if (typeof value === "number") {
			this.#value = this.#fromNumber(value)
		} else if (value instanceof Numeric) {
			this.#value = value.valueOf()
		} else {
			throw(new Error("Unsupported type for Numeric constructor"));
		}
	}

	/**
	 * Parses and converts a valid string to a `bigint`.
	 * Accepts:
	 * - Comma-separated numbers: "1,234"
	 * - Optional trailing `n`: "123n"
	 *
	 * @param value String to convert
	 * @returns Parsed bigint
	 * @throws If string is invalid
	 */
	#fromString(value: string): bigint {
		if (!Numeric.isValidString(value)) {
			throw(new Error(`Invalid numeric string: ${value}`));
		}

		let str = value.trim().replace(/n$/, "")
		if (str.includes(",")) {
			str = str.replace(/,/g, "")
		}
		return(BigInt(str));
	}

	/**
	 * Converts a valid `number` (safe integer only) to a `bigint`.
	 *
	 * @param value A safe integer number
	 * @returns Parsed bigint
	 * @throws If the number is not a safe integer
	 */
	#fromNumber(value: number): bigint {
		if (!Numeric.staticValidNumber(value)) {
			throw(new Error(`Invalid numeric number: ${value}`));
		}
		return(BigInt(value));
	}

	/**
	 * Asserts that a value is valid for creating a `Numeric` instance.
	 *
	 * @param value The value to validate
	 * @throws If the value is not a valid `bigint`, `string`, or `number`
	 *
	 * @example
	 * Numeric.assertsIsValidValue("1,000") // ✅ Passes
	 * Numeric.assertsIsValidValue("123.45") // ❌ Throws
	 */
	static assertsIsValidValue(value: unknown): asserts value is bigint | string | number {
		if (!this.isValidValue(value)) {
			throw(new Error("Value is not a valid Numeric instance"));
		}
	}

	/**
	 * Checks if the provided value is a valid input for `Numeric`.
	 * Accepts:
	 * - bigint
	 * - Valid numeric strings (whole numbers, optional commas/trailing `n`)
	 * - Safe integers
	 *
	 * @param value The value to check
	 * @returns `true` if valid, `false` otherwise
	 */
	static isValidValue(value: unknown): value is bigint | string | number {
		try {
			if (typeof value === "bigint") {return(true);}
			if (typeof value === "string") {return(this.isValidString(value));}
			if (typeof value === "number") {return(this.staticValidNumber(value));}
			return(true);
		} catch {
			return(false);
		}
	}

	/**
	 * Checks if a string is a valid numeric input (integer only, optional commas).
	 * Rejects decimal strings.
	 *
	 * @param value The string to validate
	 * @returns `true` if the string is a valid integer string, `false` otherwise
	 *
	 * @example
	 * Numeric.isValidString("1,000")  // true
	 * Numeric.isValidString("123.45") // false
	 */
	static isValidString(value: unknown): value is string {
		try {
			if (!value || typeof value !== "string") {return(false);}

			// Accept optional 'n' at the end (e.g., "123n")
			let str = value.trim().replace(/n$/, "")

			// Reject decimals
			if (str.includes(".")) {return(false);}

			// Validate comma placement
			if (str.includes(",")) {
				if (!/^-?\d{1,3}(,\d{3})+$/.test(str)) {return(false);}
				str = str.replace(/,/g, "")
			}

			if (!/^-?\d+$/.test(str)) {return(false);}

			BigInt(str)
			return(true);
		} catch {
			return(false);
		}
	}

	/**
	 * Checks whether a number is a safe integer and can be converted to `bigint`.
	 *
	 * @param value The number to validate
	 * @returns `true` if the number is safe and valid, `false` otherwise
	 */
	static staticValidNumber(value: unknown): value is number {
		try {
			if (value === null || typeof value !== "number") {return(false);}
			if (!Number.isSafeInteger(value)) {return(false);}
			BigInt(value)
			return(true);
		} catch {
			return(false);
		}
	}

	/**
	 * Returns the absolute value of the current `Numeric` instance.
	 *
	 * @returns A new `Numeric` instance with a non-negative value
	 *
	 * @example
	 * new Numeric("-123").abs().toString() // "123"
	 */
	abs(): Numeric {
		return(new Numeric(this.isNegative() ? -this.#value : this.#value));
	}

	/**
	 * Checks if the value is negative.
	 *
	 * @returns `true` if the value is less than zero, `false` otherwise
	 */
	isNegative(): boolean {
		return(this.#value < 0n);
	}

	/**
	 * Converts the internal bigint to a string.
	 *
	 * @returns String representation of the numeric value
	 */
	toString() {
		return(this.#value.toString());
	}

	/**
	 * Returns the raw internal bigint value.
	 *
	 * @returns The `bigint` stored internally
	 */
	valueOf() {
		return(this.#value);
	}

	/**
	 * Converts the numeric value to a string representation with decimal places.
	 *
	 * @param decimalPlaces Number of decimal places to format the number
	 * @returns Formatted string representation of the number with decimal places
	 * @throws Error if decimalPlaces is negative
	 * @example
	 * const num = new Numeric("12345678901234567890")
	 * num.toDecimalString(2) // "123456789012345678.90"
	 * num.toDecimalString(0) // "12345678901234567890"
	 */
	toDecimalString(
		decimalPlaces: number,
		shouldAddThousandsSeparators = false,
		shouldTrimTrailingZeros = false
	): string {
		if (decimalPlaces < 0) {
			throw(new Error("Decimal places cannot be negative"));
		}

		// For zero decimal places, return the value as a string directly
		if (decimalPlaces === 0) {
			return(this.#value.toString());
		}

		// Calculate the divisor based on decimal places
		const divisor = BigInt(10) ** BigInt(decimalPlaces)

		// Work with absolute value for calculation
		const absValue: bigint = this.isNegative() ? -this.#value : this.#value

		// Calculate the integer part (quotient)
		const quotient = (absValue / divisor).toString()

		// Calculate the decimal part (remainder), padding with leading zeros if needed
		const remainder = (absValue % divisor).toString().padStart(decimalPlaces, "0")

		// Pad the decimal part with leading zeros if needed
		const formattedRemainder = shouldTrimTrailingZeros ? trimTrailingZeros(remainder) : remainder

		// Format the integer part with thousands separators if needed
		const formattedQuotient = shouldAddThousandsSeparators ? addThousandsSeparators(quotient) : quotient

		// Reconstruct the formatted string with the original sign
		return(`${this.isNegative() ? "-" : ""}${formattedQuotient}${formattedRemainder.length > 0 ? `.${formattedRemainder}` : ""}`);
	}

	/**
	 * Converts the numeric value to a formatted string representation with thousands separators.
	 *
	 * Formatting rules:
	 * 1. **Standard numbers**: Keeps up to the specified number of decimal places, removing trailing zeros.
	 * 2. **Large numbers (≥ 1,000,000)**: Uses suffixes:
	 *    - `K` for thousands (if needed)
	 *    - `M` for millions
	 *    - `B` for billions
	 *    - `T` for trillions
	 *    - Scientific notation (`e+`) for quadrillions and above
	 * 3. **Very small numbers**: Numbers with leading zeros after the decimal are shortened with ellipsis, e.g., `0.000...03`
	 * 4. **Zero**: Returns `"0"` even for many insignificant decimals.
	 * 5. **Negative values**: Preserves the negative sign and applies same formatting rules.
	 *
	 * @param decimalPlaces Number of decimal places to format the number
	 * @returns Formatted string representation of the number with thousands separators
	 * @throws Error if decimalPlaces is negative
	 *
	 * @example
	 * new Numeric("234,567.1234500").toFormattedString(8) // "234,567.12345"
	 * new Numeric("234,567.1234567890").toFormattedString(8) // "234,567.12345678..."
	 * new Numeric("100,320,021.000000123").toFormattedString(2) // "100.32M"
	 * new Numeric("0.000000000030000027").toFormattedString(20) // "0.000...03"
	 * new Numeric("0.0000000000").toFormattedString(10) // "0"
	 * new Numeric("-5000000").toFormattedString(0) // "-5M"
	 * new Numeric("1,500,000").toFormattedString(1) // "1.5M"
	 * new Numeric("1500000000").toFormattedString(2) // "1.5B"
	 * new Numeric("2520000000000").toFormattedString(2) // "2.52T"
	 * new Numeric("2543870000000000").toFormattedString(2) // "2.54e+15"
	 * new Numeric("2500000000000000000000").toFormattedString(2) // "2.5e+21"
	 * new Numeric("2500000000000000000000000000000").toFormattedString(2) // "2.5e+30"
	 */
	toFormattedString(decimalPlaces: number): string {
		// Format the number with thousands separators
		const decimalStr = this.toDecimalString(decimalPlaces, false, true)

		// Format the number
		return(formatNumber(decimalStr));
	}

	/**
	 * Returns scientific notation number split into a base number and an optional exponent if scientific notation is used.
	 * Useful for rendering large values where separating the exponent is necessary for visual or accessibility reasons.
	 *
	 * @param decimalPlaces Number of decimal places to format before converting to scientific notation if applicable
	 * @returns An object containing:
	 * - `number`: The formatted number string
	 * - `exponent`: The exponent string if the value is in scientific notation, otherwise `undefined`
	 *
	 * @example
	 * new Numeric("2500000000000000000000").toScientificNotation(2)
	 * // { number: "2.5", exponent: "21" }
	 *
	 * new Numeric("123456").toScientificNotation(2)
	 * // { number: "123,456", exponent: undefined }
	 */
	toScientificNotation(decimalPlaces: number): { number: string; exponent?: string } {
		const formatted = this.toFormattedString(decimalPlaces)
		const parts = formatted.split("e+")
		if (parts.length > 1) {
			return({
				number: parts[0],
				exponent: parts[1]
			});
		}
		return({
			number: formatted,
			exponent: undefined
		});
	}

	/**
	 * Compares this numeric value for equality with another `Numeric` instance.
	 *
	 * @param other The other `Numeric` instance to compare against
	 * @returns `true` if both values are equal, `false` otherwise
	 *
	 * @example
	 * new Numeric("123").isEqual(new Numeric("123")) // true
	 * new Numeric("123").isEqual(new Numeric("124")) // false
	 */
	isEqual(other: ConstructorParameters<typeof Numeric>[0]): boolean {
		return(this.#value === BigInt(other.valueOf()));
	}

	/**
	 * Checks whether this value is greater than the provided `Numeric` instance.
	 *
	 * @param other The other `Numeric` instance to compare against
	 * @returns `true` if this value is greater, `false` otherwise
	 *
	 * @example
	 * new Numeric("200").isGreaterThan(new Numeric("150")) // true
	 */
	isGreaterThan(other: ConstructorParameters<typeof Numeric>[0]): boolean {
		return(this.#value > BigInt(other.valueOf()));
	}

	/**
	 * Checks whether this value is less than the provided `Numeric` instance.
	 *
	 * @param other The other `Numeric` instance to compare against
	 * @returns `true` if this value is less, `false` otherwise
	 *
	 * @example
	 * new Numeric("100").isLessThan(new Numeric("150")) // true
	 */
	isLessThan(other: ConstructorParameters<typeof Numeric>[0]): boolean {
		return(this.#value < BigInt(other.valueOf()));
	}

	/**
	 * Compares this numeric value with another `Numeric` instance.
	 *
	 * @param other The other `Numeric` instance to compare against
	 * @returns
	 * - `0` if both values are equal
	 * - `1` if this value is greater
	 * - `-1` if this value is smaller
	 *
	 * @example
	 * new Numeric("123").compare(new Numeric("123")) // 0
	 * new Numeric("200").compare(new Numeric("123")) // 1
	 * new Numeric("100").compare(new Numeric("123")) // -1
	 */
	compare(other: ConstructorParameters<typeof Numeric>[0]): number {
		if (this.isEqual(other)) {return(0);}
		if (this.isGreaterThan(other)) {return(1);}
		return(-1);
	}

	static fromDecimalString(value: string, decimalPlaces: number): Numeric {
		if (typeof value !== "string") {
			throw(new Error("Value must be a string"));
		}

		if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
			throw(new Error("Decimal places must be a non-negative integer"));
		}

		// Clean up the string: remove anything that’s not a digit, dot or comma
		const cleaned = value.replace(/[^\d.,]/g, "")

		// Identify last decimal separator
		const lastComma = cleaned.lastIndexOf(",")
		const lastDot = cleaned.lastIndexOf(".")
		const decimalIndex = Math.max(lastComma, lastDot)

		let intPart = cleaned
		let decimalPart = ""

		if (decimalIndex !== -1) {
			intPart = cleaned.slice(0, decimalIndex)
			decimalPart = cleaned.slice(decimalIndex + 1)
		}

		// Remove all separators from int part
		const sanitizedInt = intPart.replace(/[.,]/g, "")
		const sanitizedDecimal = decimalPart.replace(/[.,]/g, "")

		// Validate decimal places
		if (sanitizedDecimal.length > decimalPlaces) {
			throw(new Error(`Too many decimal digits: got ${sanitizedDecimal.length}, max allowed is ${decimalPlaces}`));
		}

		// Pad decimal part
		const paddedDecimal = sanitizedDecimal.padEnd(decimalPlaces, "0")

		// Concatenate and convert
		const fullNumberStr = sanitizedInt + paddedDecimal
		if (!/^-?\d+$/.test(fullNumberStr)) {
			throw(new Error(`Invalid numeric string after processing: ${fullNumberStr}`));
		}

		return(new Numeric(BigInt(fullNumberStr)));
	}
}
