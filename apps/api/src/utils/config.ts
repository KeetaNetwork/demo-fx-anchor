export function getEnv(name: string, defaultValue?: string): string {
	const value = process.env[name];
	if (value === undefined) {
		if (defaultValue !== undefined) {
			return(defaultValue);
		}

		throw(new Error(`missing environment variable: ${name}`));
	}

	return(value);
}
