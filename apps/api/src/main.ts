import type { ApiServerConfig } from "./server";
import { createApiServer } from "./server";
import { getEnv } from "./utils/config";
// import { getConfigFromEnvironment, getEnv } from "./utils/config";

async function main(): Promise<0 | 1> {

	// const db = getConfigFromEnvironment('server')

	const config: ApiServerConfig = {
		server: {
			prefix: getEnv('APP_PREFIX', '/api'),
			port: parseInt(getEnv('PORT', '8080'), 10)
		},

		keetaNet: {
			seed: "",
			index: 0
		}
	}

	let server: Awaited<ReturnType<typeof createApiServer>>['server'];
	try {
		let info;
		({ server, info } = await createApiServer(config));

		const address = info.address === "::" ? "localhost" : info.address;
		console.log(`Server is running at http://${address}:${info.port}`);

		// graceful shutdown
		process.on('beforeExit', function() {
			if (server.listening) {
				server.close()
			}
		});
	} catch (error: unknown) {
		console.error("Error starting server:", error);
	}

	await new Promise<void>(function(resolve) {
		server.on('close', function() {
			resolve();
		});
	});

	return(0);
}

main().then(function(code) {
	process.exit(code);
}, function(error: unknown) {
	console.error(error);
	process.exit(1);
});
