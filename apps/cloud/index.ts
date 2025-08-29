import * as components from '@keetanetwork/pulumi-components';
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as path from "path";
import { getPrefixHash, generateName } from './utils.js';
import type { GCPRegion } from '@keetanetwork/pulumi-components/dist/packages/gcp/constants';

type ConfigImageRemote = Partial<Pick<Parameters<components.docker.RemoteDockerImage['_checkImage']>[2], 'serviceAccount' | 'bucket' | 'bindPermissions'>> & {
	bucketConfig?: Partial<Pick<ConstructorParameters<typeof gcp.storage.Bucket>[1], 'logging'>>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DockerRemoteImageArgs = Extract<ConstructorParameters<typeof components.docker.DockerImage>[1], { bucket: any }>;

interface IPv4AddressConfig {
	ipv4: pulumi.Input<string>
	ipv6?: pulumi.Input<string>
}

interface IPv6AddressConfig {
	ipv4?: pulumi.Input<string>
	ipv6: pulumi.Input<string>
}

interface KeetaNetDemoFXProviderArgs {
	/**
     * GCP project
     */
	project: string;

	/**
     * GCP region
     */
	mainRegion: GCPRegion;

	/**
	 * IP address to use for the load balancer (default is an ephemeral IP)
	 */
	ipAddress?: pulumi.Input<string> | IPv4AddressConfig | IPv6AddressConfig;

	/**
	 * Deployment name
	 */
	deploymentName: string;

	/**
	 * The domain to use for the service
	 */
	domain: pulumi.Input<string>;

	/**
	 * SSL certificate to use for the service
	 */
	sslCertificate?: Pick<gcp.compute.ManagedSslCertificate, "id">

	app: {
		/**
		 * The seed to use for the KeetaNet network
		 */
		seed: pulumi.Input<string>;
	}


	image: {
		/**
		 * The URL of the Docker registry to use
		 */
		registryUrl?: string;

		/**
		 * Configuration to use a remote Docker image build
		 */
		remote?: ConfigImageRemote;

		/**
		 * The build configuration for the Docker image
		 */
		build: {
			/**
			 * The directory to use for the Docker image build
			 */
			directory?: string;

			/**
			 * The GitHub SHA to use as the version for the Docker image
			 */
			githubSha?: string;

			/**
			 * Docker options for the remote image
			 */
			dockerOptions?: Pick<DockerRemoteImageArgs, 'serviceAccount' | 'bucket' | 'provider' | 'registryUrl'>;
		};

		/**
		 * Node image to use for the Docker build
		 */
		nodeImage?: pulumi.Input<string>;
	}
}

export class KeetaNetDemoFXProvider extends pulumi.ComponentResource {
	readonly name: string;
	readonly config: KeetaNetDemoFXProviderArgs;

	private buildDirectory: string;
	private serviceAccount?: gcp.serviceaccount.Account;

	constructor(name: string, args: KeetaNetDemoFXProviderArgs, opts?: pulumi.ComponentResourceOptions) {
		super("Keeta:GCP:DemoFXProvider", name, args, opts);
		this.name = name;
		this.config = args;

		const region = this.config.mainRegion;

		const scriptDir = path.dirname(new URL(import.meta.url).pathname)

		/*
		 * The build directory is where the API source code and Dockerfile
		 * are located.
		 */
		this.buildDirectory = this.config.image.build.directory ?? path.join(scriptDir, '../api');

		const buildArgs: { [key: string]: pulumi.Input<string> } = {}
		if (this.config.image.nodeImage) {
			buildArgs.NODE_IMAGE = this.config.image.nodeImage;
		}

		// Image build configuration
		let imageConfig: ConstructorParameters<typeof components.docker.DockerImage>[1] = {
			versioning: this.getDockerImageVersioning(),
			imageName: components.utils.normalizeName(name, "runner"),
			registryUrl: this.getRegistryUrl(),
			platform: 'linux/amd64',
			buildArgs: buildArgs,
			buildTarget: "runner",
			buildDirectory: {
				type: 'DIRECTORY',
				directory: this.buildDirectory
			},
			...this.config.image.build.dockerOptions
		};

		// Get the remote configuration if available
		const remoteConfig = this.getRemoteConfig(`${name}-runner`);
		if (remoteConfig) {
			imageConfig = {
				...imageConfig,
				...remoteConfig
			}
		}

		const apiImage = new components.docker.DockerImage(`${name}-image`, imageConfig);

		// Create a Cloud Run service for the API
		const apiService = new gcp.cloudrun.Service(`${name}-api-service`, {
			location: region,
			template: {
				spec: {
					containers: [{
						image: apiImage.uri,
						// ports: [{ containerPort: 8080 }],
						envs: [{
							name: "APP_SEED",
							value: pulumi.output(this.config.app.seed).apply(function(seed) {
								if (seed === undefined || seed === null || seed === '') {
									throw(new Error('config.app.seed is required'));
								}
								return(seed);
							})
						}]
					}]
				}
			}
		});

		// Allow unauthenticated access
		new gcp.cloudrun.IamMember(`${name}-api-invoker`, {
			service: apiService.name,
			location: apiService.location,
			role: "roles/run.invoker",
			member: "allUsers"
		});


		// Create Cloud Run backend
		const apiNEG = new gcp.compute.RegionNetworkEndpointGroup(`${name}-api-neg`, {
			region: region,
			networkEndpointType: "SERVERLESS",
			cloudRun: {
				service: apiService.name
			}
		});

		const apiBackend = new gcp.compute.BackendService(`${name}-api-be`, {
			protocol: 'HTTP',
			loadBalancingScheme: 'EXTERNAL_MANAGED',
			backends: [{
				group: apiNEG.id
			}]
		});


		const urlMap = new gcp.compute.URLMap(`${name}-url-map`, {
			defaultService: apiBackend.id
		});

		// HTTPS certificate
		let sslCertificate: Pick<gcp.compute.ManagedSslCertificate, "id">
		if (this.config.sslCertificate) {
			sslCertificate = this.config.sslCertificate;
		} else {
			sslCertificate = new gcp.compute.ManagedSslCertificate(`${name}-ssl-cert`, {
				name: `${name}-ssl-cert`,
				managed: {
					domains: [this.config.domain]
				}
			});
		}

		// Target HTTPS Proxy
		const httpsProxy = new gcp.compute.TargetHttpsProxy(`${name}-https-proxy`, {
			sslCertificates: [sslCertificate.id],
			urlMap: urlMap.id
		});

		// Global forwarding rule(s)
		const ipAddresses: { kind: 'ipv4' | 'ipv6' | ''; ip: pulumi.Input<string> }[] = [];
		if (typeof this.config.ipAddress === "object" && this.config.ipAddress && 'ipv4' in this.config.ipAddress && this.config.ipAddress.ipv4 !== undefined) {
			ipAddresses.push({ kind: 'ipv4', ip: this.config.ipAddress.ipv4 });
		}
		if (typeof this.config.ipAddress === "object" && this.config.ipAddress && 'ipv6' in this.config.ipAddress && this.config.ipAddress.ipv6 !== undefined) {
			ipAddresses.push({ kind: 'ipv6', ip: this.config.ipAddress.ipv6 });
		}
		if (this.config.ipAddress !== undefined) {
			if (typeof this.config.ipAddress === "string" || !('ipv4' in this.config.ipAddress) && !('ipv6' in this.config.ipAddress)) {
				ipAddresses.push({ kind: '', ip: this.config.ipAddress });
			}
		}

		for (const ipAddress of ipAddresses) {
			const forwardingRuleName = `${name}-fr-${ipAddress.kind}`.replace(/-$/, '');
			new gcp.compute.GlobalForwardingRule(forwardingRuleName, {
				ipAddress: ipAddress.ip,
				ipProtocol: "TCP",
				portRange: "443",
				target: httpsProxy.id,
				loadBalancingScheme: 'EXTERNAL_MANAGED'
			}, { deleteBeforeReplace: true });
		}
	}

	/**
	 * Get the registry URL for the Docker image
	 */
	private getRegistryUrl() {
		if (!this.config.image.registryUrl) {
			if (!this.config.project) {
				throw(new Error('No project specified, could not get default registry URL'));
			}
			// Default to the GCP Artifact Registry URL
			return(`${this.config.mainRegion}-docker.pkg.dev/${this.config.project}/keeta`);
		}

		return(this.config.image.registryUrl);
	}

	/**
	 * Get the versioning configuration for the Docker image
	 */
	private getDockerImageVersioning(): NonNullable<ConstructorParameters<typeof components.docker.DockerImage>[1]>['versioning'] {
		// Use the GitHub SHA as the version if available
		if (this.config.image.build.githubSha) {
			return({
				type: 'PLAIN',
				value: this.config.image.build.githubSha
			});
		}

		// Fallback to using the directory as the version
		return({
			type: 'FILE',
			fromFile: this.buildDirectory
		});
	}

	/**
	 * Get the remote configuration for the Docker image
	 */
	private getRemoteConfig(name: string) {
		if (!this.config.image.remote) {
			return(undefined);
		}

		// Create the GCP provider
		const provider = new gcp.Provider(`${name}-provider`, {
			project: this.config.project,
			region: this.config.mainRegion
		}, { parent: this });

		let { bindPermissions, serviceAccount, bucket } = this.config.image.remote;

		// If no remote config options are specified, default to binding permissions
		if (bindPermissions === undefined && (serviceAccount === undefined || bucket === undefined)) {
			bindPermissions = true;
		}

		// If no service account is specified, create a new one
		if (!serviceAccount) {
			if (!this.serviceAccount) {
				this.serviceAccount = new gcp.serviceaccount.Account(`${this.name}-service-account`, {
					accountId: `${getPrefixHash(`${this.name}-${this.config.deploymentName}`, 10)}-docker-ee`
				}, { parent: this });
			}
			serviceAccount = this.serviceAccount;
		}

		// If no bucket is specified, create a new one
		if (!bucket) {
			bucket = new gcp.storage.Bucket(generateName(name, 'docker', 55), {
				location: this.config.mainRegion,
				forceDestroy: true,
				uniformBucketLevelAccess: true,
				...this.config.image.remote.bucketConfig
			}, { parent: this });
		} else if (gcp.storage.Bucket.isInstance(bucket)) {
			pulumi.output(bucket.forceDestroy).apply(function(forceDestroy) {
				if (!forceDestroy) {
					console.debug('Explorer Image bucket should have forceDestroy set to true to avoid issues with remote docker image');
				}
			});
		}

		return({
			provider,
			bindPermissions,
			serviceAccount,
			bucket
		});
	}
}
