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

type KeetaNetKYCDemoBaseConfig = {
	databaseURL: string;
	databaseCert?: string | undefined;
	tableName: string;
	enableDebug: boolean;
};

export function getConfigFromEnvironment(kind: 'server'): KeetaNetKYCDemoBaseConfig {
	const baseConfig: KeetaNetKYCDemoBaseConfig = {
		databaseURL: getEnv('APP_DATABASE_URL'),
		databaseCert: process.env.APP_DATABASE_CERT,
		tableName: getEnv('APP_TABLE_NAME', 'fx_demo'),
		enableDebug: Boolean(getEnv('APP_ENABLE_DEBUG', 'false'))
	};

	switch (kind) {
		case 'server':
			return(baseConfig);
		default:
			throw(new Error(`invalid kind: ${kind}`));
	}
}
