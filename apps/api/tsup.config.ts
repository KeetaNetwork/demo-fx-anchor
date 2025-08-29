import { defineConfig } from 'tsup'

export default defineConfig({
	entry: ['src/main.ts'],
	bundle: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	target: 'node20',
	platform: 'node',
	format: ['cjs'],
	outDir: 'dist',
	shims: false,
	treeshake: true,
	external: [
		/@keetanetwork\/asn1-napi-rs/,
		/@keetanetwork\/pulumi-components/,
		"bufferutil",
		"utf-8-validate",
	],
	noExternal: [
		/@keetanetwork\/anchor/,
		/@keetanetwork\/keetanet-client/,
	]
})
