# Default target
all: dist

# This target provides a list of targets.
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all           - Builds the project"
	@echo "  dist          - Builds the project"
	@echo "  do-dev-server - Runs a development environment and launches an HTTP server"
	@echo "  clean         - Removes build artifacts"
	@echo "  distclean     - Removes all build artifacts and dependencies"

do-dev-server: node_modules
	npx tsx watch src/main.ts

do-lint: node_modules
	npm run eslint -- --config .eslint.config.mjs src

node_modules/.done: Makefile package.json package-lock.json
	rm -rf node_modules
	npm clean-install
	@touch node_modules/.done

node_modules: node_modules/.done
	@touch node_modules

dist/.done: node_modules tsconfig.json tsup.config.ts $(shell find src -type f -name '*.ts') ../../tsconfig.json src/Dockerfile
	rm -rf dist
	mkdir dist
	npm run tsup -- --outDir ./dist
	cp .npmrc dist/.npmrc
	node -p 'const input = JSON.parse(fs.readFileSync(0, "utf-8")); delete input["scripts"]; delete input["devDependencies"]; JSON.stringify(input, undefined, 4);' < package.json > dist/package.json
	node -p "((s) => JSON.stringify({ ...s, packages: Object.fromEntries(Object.entries(s.packages).map(([k, v]) => [k, k === '' ? { ...v, devDependencies: undefined } : v.dev ? undefined : v]).filter(([, v]) => v !== undefined)) }, null, 4))(require('./npm-shrinkwrap.json'))" > dist/npm-shrinkwrap.json
	cp src/Dockerfile dist/Dockerfile
	@touch dist/.done

dist: dist/.done
	@touch dist

clean:
	rm -rf dist

distclean: clean
	rm -rf node_modules

.PHONY: all help test do-dev-server do-lint clean distclean
