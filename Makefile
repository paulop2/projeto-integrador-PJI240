ZITADEL_KIT ?= infra/zitadel
ZITADEL_STACK ?= pj240-zitadel
ZITADEL_AUTH_DOMAIN ?=
ZITADEL_ADMIN_EMAIL ?=
ZITADEL_MANIFEST ?= zitadel.manifest.json
ZITADEL_ENV ?= .deploy/production/.env.zitadel
ZITADEL_LOCAL_ENV ?= .deploy/local/.env.zitadel
APP_ORIGIN ?= https://pj240.pages.dev
APP_LOCAL_ORIGIN ?= http://localhost:8788

.PHONY: zitadel-check zitadel-env zitadel-bootstrap zitadel-local-env zitadel-local-up zitadel-local-down zitadel-local-bootstrap

zitadel-check:
	$(ZITADEL_KIT)/bin/bootstrap --check $(ZITADEL_MANIFEST)

zitadel-env:
	@test -n "$(ZITADEL_AUTH_DOMAIN)" -a -n "$(ZITADEL_ADMIN_EMAIL)" || { echo 'Defina ZITADEL_AUTH_DOMAIN e ZITADEL_ADMIN_EMAIL.'; exit 1; }
	$(ZITADEL_KIT)/bin/generate-env --out $(ZITADEL_ENV) --stack $(ZITADEL_STACK) --auth-domain $(ZITADEL_AUTH_DOMAIN) --admin-email $(ZITADEL_ADMIN_EMAIL)

zitadel-bootstrap:
	$(ZITADEL_KIT)/bin/operator --stack-env $(ZITADEL_ENV) --manifest $(ZITADEL_MANIFEST) --app-origin $(APP_ORIGIN)

zitadel-local-env:
	@test -n "$(ZITADEL_ADMIN_EMAIL)" || { echo 'Defina ZITADEL_ADMIN_EMAIL.'; exit 1; }
	$(ZITADEL_KIT)/bin/generate-env --out $(ZITADEL_LOCAL_ENV) --stack $(ZITADEL_STACK)-local --admin-email $(ZITADEL_ADMIN_EMAIL) --local

zitadel-local-up:
	docker compose --env-file $(ZITADEL_LOCAL_ENV) -f $(ZITADEL_KIT)/compose.yaml -f $(ZITADEL_KIT)/compose.local.yaml up -d

zitadel-local-down:
	docker compose --env-file $(ZITADEL_LOCAL_ENV) -f $(ZITADEL_KIT)/compose.yaml -f $(ZITADEL_KIT)/compose.local.yaml down

zitadel-local-bootstrap:
	$(ZITADEL_KIT)/bin/operator --stack-env $(ZITADEL_LOCAL_ENV) --manifest $(ZITADEL_MANIFEST) --app-origin $(APP_LOCAL_ORIGIN) --local
