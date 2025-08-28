import * as pg from 'ts-postgres';
import { execSync } from 'child_process';
import { X509Certificate } from 'crypto';

export type RequestData = {
	account: string;
	countryCodes: string[];
	certificate?: string;
}

type RequestWithId = {
	id: string;
	status: string;
	data: RequestData;
};

type KeetaNetKYCDemoPostgreSQLLocalConfig = {
	databaseCert?: string | undefined;
	tableName: string;
};
type KeetaNetKYCDemoPostgreSQLConfig = NonNullable<Parameters<typeof pg.connect>[0]> & KeetaNetKYCDemoPostgreSQLLocalConfig;

export const requestsMemory = new Map<string, RequestData>();

export class KeetaNetKYCDemoPostgreSQL {
	#client: pg.Client;
	#config: KeetaNetKYCDemoPostgreSQLLocalConfig;
	#initPromise: Promise<void>;

	#queries!: {
		set: pg.PreparedStatement;
		get: pg.PreparedStatement<{ status: string, value: string; }>
		getForUpdate: pg.PreparedStatement<{ status: string, value: string; }>
		getPending: pg.PreparedStatement<{ key: string; value: string; }>
		getPendingForUpdate: pg.PreparedStatement<{ key: string; value: string; }>
		getNextSerialNumber: pg.PreparedStatement<{ serial: number }>
	};

	private constructor(client: pg.Client, config: KeetaNetKYCDemoPostgreSQLLocalConfig) {
		this.#client = client;
		this.#config = { ...config };

		this.#initPromise = this.#init();
	}

	async #waitForInit(): Promise<void> {
		await this.#initPromise;
	}

	async close() {
		await this.#client.end();
	}

	async #init(): Promise<void> {
		await this.#client.query(`CREATE TABLE IF NOT EXISTS ${this.#config.tableName} (key TEXT PRIMARY KEY, status TEXT NOT NULL, time TIMESTAMPTZ NOT NULL, value TEXT NOT NULL)`);
		await this.#client.query(`CREATE INDEX IF NOT EXISTS ${this.#config.tableName}_status ON ${this.#config.tableName} (status)`);
		await this.#client.query('CREATE SEQUENCE IF NOT EXISTS cert_serial');
		this.#queries = {
			set: await this.#client.prepare(`INSERT INTO ${this.#config.tableName} (key, status, time, value) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO UPDATE SET status = $2, value = $4`),
			get: await this.#client.prepare(`SELECT status, value FROM ${this.#config.tableName} WHERE key = $1`),
			getForUpdate: await this.#client.prepare(`SELECT status, value FROM ${this.#config.tableName} WHERE key = $1 FOR UPDATE`),
			getPending: await this.#client.prepare(`SELECT key, value FROM ${this.#config.tableName} WHERE status = 'pending' LIMIT 100`),
			getPendingForUpdate: await this.#client.prepare(`SELECT key, value FROM ${this.#config.tableName} WHERE status = 'pending' LIMIT 100 FOR UPDATE`),
			getNextSerialNumber: await this.#client.prepare("SELECT nextval('cert_serial') AS serial")
		}
	}

	static async createFromURL(url: string, config: KeetaNetKYCDemoPostgreSQLConfig): Promise<KeetaNetKYCDemoPostgreSQL> {
		const urlObject = new URL(url);
		if (urlObject.protocol !== 'postgres:') {
			throw(new Error('Invalid URL, must be a PostgreSQL URL (postgres://...)'));
		}

		const tsPGSSLMode = (function(): NonNullable<NonNullable<Parameters<typeof pg.connect>[0]>['ssl']> {
			const databaseCert = config.databaseCert;
			if (databaseCert === undefined) {
				return(pg.SSLMode.Disable);
			}
			const protocol = urlObject.protocol.split(':')[0];

			let startTLSCommand: string;
			let connectTo: string;
			switch (protocol) {
				case 'https':
					startTLSCommand = '';
					connectTo = `${urlObject.hostname}:${urlObject.port || 443}`;
					break;
				default:
					startTLSCommand = `-starttls ${protocol}`;
					connectTo = urlObject.host;
					break;
			}

			const foundCert = execSync(`echo '' | openssl s_client -connect ${connectTo} ${startTLSCommand} 2>/dev/null | openssl x509`).toString('utf8');
			const cert = new X509Certificate(foundCert);
			const foundDomain = cert.subjectAltName?.replace(/, .*$/, '').replace(/^DNS:/, '');
			if (!foundDomain || foundDomain === '') {
				throw new Error('Could not find domain from TLS certificate');
			}

			return({
				mode: pg.SSLMode.Require as const,
				options: {
					ca: databaseCert,
					servername: foundDomain
				}
			});
		})();

		const newConfig: KeetaNetKYCDemoPostgreSQLConfig = {
			host: urlObject.hostname,
			port: Number(urlObject.port),
			user: urlObject.username,
			password: urlObject.password,
			database: urlObject.pathname.slice(1),
			ssl: tsPGSSLMode,
			...config
		};

		return(await KeetaNetKYCDemoPostgreSQL.create(newConfig));
	}

	static async create(config: KeetaNetKYCDemoPostgreSQLConfig): Promise<KeetaNetKYCDemoPostgreSQL> {
		const handle = await pg.connect(config);
		const instance = new KeetaNetKYCDemoPostgreSQL(handle, config);
		await instance.#waitForInit();

		return(instance);
	}

	private isRequestData(obj: any): obj is RequestData {
		return (
		  typeof obj === 'object' &&
		  obj !== null &&
		  typeof obj.account === 'string' &&
		  Array.isArray(obj.countryCodes) &&
		  obj.countryCodes.every((code: unknown) => typeof code === 'string')
		  // certificate is optional and of type unknown, so no validation needed
		);
	  }

	private parseEntryFromJSONString(input: string): RequestData | null {
		try {
			const parsedValue: unknown = JSON.parse(input);
			if (this.isRequestData(parsedValue)) {
				return(parsedValue);
			} else {
				return(null);
			}
		} catch {
			return(null);
		}
	}

	async getNextSerialNumber(): Promise<number> {
		const serialResult = await this.#queries.getNextSerialNumber.execute();
		if (serialResult.rows.length !== 1) {
			throw(new Error(`Serial returned ${serialResult.rows.length} rows`));
		}
		const serial = serialResult.rows[0].get('serial');
		if (serial === undefined) {
			throw(new Error('Serial is undefined'));
		}
		return(serial);
	}

	async set(input: RequestWithId): Promise<void> {
		await this.#queries.set.execute([input.id, input.status, new Date(), JSON.stringify(input.data)]);
	}

	async get(id: string, forUpdate = false): Promise<RequestWithId | null> {
		let results;
		if (forUpdate) {
			results = await this.#queries.getForUpdate.execute([id]);
		} else {
			results = await this.#queries.get.execute([id]);
		}
		if (results.rows.length === 0) {
			return(null);
		}

		if (results.rows.length > 1) {
			throw(new Error('Multiple keys found'));
		}

		const result = results.rows[0]?.get('value');
		const status = results.rows[0]?.get('status');
		if (result === undefined) {
			throw(new Error('Value not found'));
		}

		const parsedValue = this.parseEntryFromJSONString(result);
		if (parsedValue === null) {
			return(null);
		}

		return({
			id,
			status,
			data: parsedValue
		});
	}
}
