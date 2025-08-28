# Default target
all: dist

# This target provides a list of targets.
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all           - Builds the project"
	@echo "  dist          - Builds the project"
	@echo "  test          - Runs the test suite"
	@echo "  do-dev-server - Runs a development environment and launches an HTTP server"
	@echo "  do-npm-pack   - Builds the project and creates a tarball"
	@echo "  clean         - Removes build artifacts"
	@echo "  distclean     - Removes all build artifacts and dependencies"

test:
	@echo 'not implemented'
	@exit 1

do-dev-server: node_modules
	./utils/start-dev-server.ts

do-lint: node_modules
	@echo 'not implemented'
	@exit 1

# 
# Dependencies
# 
node_modules/.done: Makefile package.json package-lock.json
	rm -rf node_modules
	npm clean-install
	@touch node_modules/.done

node_modules: node_modules/.done
	@touch node_modules

# 
# Build targets
# 

# Client
apps/client/dist/.done:
	$(MAKE) -C apps/client dist

dist/client/.done: apps/client/dist/.done
	@mkdir -p dist
	rm -rf dist/client
	mkdir dist/client
	cp -r apps/client/dist/* dist/client/
	@touch dist/client/.done

dist/client: dist/client/.done
	@touch dist/client

# API
apps/api/dist/.done:
	$(MAKE) -C apps/api dist

dist/api/.done: apps/api/dist/.done
	@mkdir -p dist
	rm -rf dist/api
	mkdir dist/api
	cp -r apps/api/dist/* dist/api/
	@touch dist/api/.done

dist/api: dist/api/.done
	@touch dist/api

# Cloud
dist/cloud/.done: node_modules apps/cloud/tsconfig.json $(shell find apps/cloud -type f -name '*.ts')
	@mkdir -p dist
	rm -rf dist/cloud
	mkdir dist/cloud
	npm run tsc -- --outDir dist/cloud -p apps/cloud/tsconfig.json
	@touch dist/cloud/.done

dist/cloud: dist/cloud/.done
	@touch dist/cloud

# Final distribution target
dist/.done: dist/api dist/client dist/cloud utils/make-package-info
	cp npm-shrinkwrap.json dist/
	./utils/make-package-info . dist/
	@touch dist/.done

dist: dist/.done
	@touch dist

# 
# Packaging targets
# 
do-npm-pack: dist
	cd dist && npm pack
	mv dist/keetanetwork-demo-kyc-*.tgz .

# 
# Cleaning targets
# 
clean:
	rm -rf dist
	$(MAKE) -C apps/client clean
	$(MAKE) -C apps/api clean

distclean: clean
	rm -rf node_modules
	$(MAKE) -C apps/client distclean
	$(MAKE) -C apps/api distclean

.PHONY: all help test do-dev-server do-lint do-npm-pack clean distclean
