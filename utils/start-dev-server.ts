#!/usr/bin/env -S npx tsx
import { spawn } from "child_process";

function runSubprojectServer(
	path: string,
	command: string,
	args: string[] = [],
	envVars: { [key: string]: string | undefined } = {}
) {
	const child = spawn(command, args, {
		cwd: path,
		stdio: "inherit",
		shell: true,
		env: {
			...process.env,
			...envVars
		}
	});

	child.on("close", (code) => {
		console.log(`Process in ${path} exited with code ${code}`);
	});

	child.on("error", (err) => {
		console.error(`Error starting process in ${path}:`, err);
	});

	return(child);
}

const apiPort = String(
	process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 8080
);

const processes = [
	runSubprojectServer("apps/api", "npm", ["run", "dev"], { PORT: apiPort })
];

process.on("SIGINT", () => {
	processes.forEach((p) => p.kill());
	process.exit(0);
});
