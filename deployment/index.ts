import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

import { KeetaNetDemoFXProvider } from '../dist/cloud/index.js';

const deploymentName = pulumi.getStack();

/**
 * Get the GitHub SHA from the environment variables.
 */
let githubSha: string | undefined;
if (process.env.GITHUB_SHA) {
	githubSha = `git_${process.env.GITHUB_SHA}`;
}

const ip = new gcp.compute.GlobalAddress(`demo-fx-provider-${deploymentName}-ip`, {}, {
	protect: true
});

const stackConfig = new pulumi.Config();
const appSeed = stackConfig.requireSecret('DEMO_ANCHOR_SEED');

new KeetaNetDemoFXProvider(`demo-fx-provider-${deploymentName}`, {
	domain: 'demo-fx-provider.dev.keeta.com',
	project: 'mimetic-algebra-344104',
	mainRegion: 'us-central1',
	deploymentName,
	image: {
		registryUrl: `us-central1-docker.pkg.dev/mimetic-algebra-344104/keeta/${deploymentName}-demo-fx-provider`,
		remote: {
			bindPermissions: true
		},
		build: {
			githubSha
		}
	},
	app: {
		seed: appSeed
	},
	ipAddress: ip.address
});
