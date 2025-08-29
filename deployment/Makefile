do-deps:
	$(MAKE) -C .. dist

do-deploy: do-deps
	pulumi up $(KEETANET_DEMO_KYC_PULUMI_ARGS)

.PHONY: do-deps do-deploy
