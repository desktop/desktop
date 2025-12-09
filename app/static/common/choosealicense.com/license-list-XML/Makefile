# SPDX-License-Identifier: CC0-1.0

TOOL_VERSION = 2.1.23
TEST_DATA = test/simpleTestForGenerator
GIT_AUTHOR = License Publisher (maintained by Gary O'Neall) <gary@sourceauditor.com>
GIT_AUTHOR_EMAIL = gary@sourceauditor.com
LICENSE_DATA_REPO_NO_SCHEME = github.com/spdx/license-list-data.git
LICENSE_DATA_REPO = https://$(LICENSE_DATA_REPO_NO_SCHEME)
LICENSE_DATA_URL = https://$(LICENSE_LIST_GITHUB_TOKEN)@$(LICENSE_DATA_REPO_NO_SCHEME)
LICENSE_OUTPUT_DIR = .tmp
GITVERSION = $(shell git describe --always || echo 'UNKNOWN')
# Remove leading 'v' or 'V'
VERSION = $(subst V,,$(subst v,,$(GITVERSION)))
RELEASE_DATE = $(shell date '+%Y-%m-%d')
COMMIT_MSG = License list build $(VERSION) using license list publisher $(TOOL_VERSION)
RELEASE_MSG = Adding release matching the license list XML tag $(VERSION)
NUM_FILES_CHANGED = $(shell git diff --name-only $(INPUT_BASE_REF) $(GITHUB_SHA) | wc -l)
SOURCE_FILE_CHANGED = $(strip $(shell git diff --name-only $(INPUT_BASE_REF) $(GITHUB_SHA) | grep 'src/'))
NUM_SOURCE_FILE_CHANGED = $(shell git diff --name-only $(INPUT_BASE_REF) $(GITHUB_SHA) | grep 'src/' | wc -l)
LICENSE_SOURCE_DIR = src
LICENSE_SOURCE = $(strip $(if $(and $(or $(filter $(NUM_FILES_CHANGED),1), $(filter $(NUM_FILES_CHANGED),2)), $(filter $(NUM_SOURCE_FILE_CHANGED),1)), $(SOURCE_FILE_CHANGED), $(LICENSE_SOURCE_DIR)));
.PHONY: validate-canonical-match
validate-canonical-match: licenseListPublisher-$(TOOL_VERSION).jar-valid $(TEST_DATA) $(LICENSE_OUTPUT_DIR)
	echo Validating source files from $(LICENSE_SOURCE)
	java -jar -DLocalFsfFreeJson=true -DlistedLicenseSchema="schema/ListedLicense.xsd" licenseListPublisher-$(TOOL_VERSION).jar LicenseRDFAGenerator '$(LICENSE_SOURCE:;=)' '$(LICENSE_OUTPUT_DIR)' 1.0 2000-01-01 $(TEST_DATA) expected-warnings

.PHONY: deploy-license-data
deploy-license-data: licenseListPublisher-$(TOOL_VERSION).jar-valid $(TEST_DATA)
	rm -rf '$(LICENSE_OUTPUT_DIR)'
	git clone --quiet --depth 1 $(LICENSE_DATA_URL) '$(LICENSE_OUTPUT_DIR)'
	# Clean out the old data directories
	find '$(LICENSE_OUTPUT_DIR)' -mindepth 1 -maxdepth 1 -name .git -prune -o -name .github -prune -o -type d -exec rm -rf {} \+
	rm -f $(LICENSE_OUTPUT_DIR)/licenses.md
	java -jar -DLocalFsfFreeJson=true -DlistedLicenseSchema="schema/ListedLicense.xsd" licenseListPublisher-$(TOOL_VERSION).jar LicenseRDFAGenerator '$(LICENSE_SOURCE_DIR)' '$(LICENSE_OUTPUT_DIR)' $(VERSION) $(RELEASE_DATE) $(TEST_DATA) expected-warnings
	git -C '$(LICENSE_OUTPUT_DIR)' add -A .
	git config user.email "$(GIT_AUTHOR_EMAIL)"
	git -C '$(LICENSE_OUTPUT_DIR)' commit --author "$(GIT_AUTHOR)" -m "$(COMMIT_MSG)"
	git -C '$(LICENSE_OUTPUT_DIR)' push origin

.PHONY: release-license-data
release-license-data: deploy-license-data
	if [[ $(VERSION) =~ .+-g[a-f0-9]{7} ]] ; then echo Can not release license data - license list version $(VERSION) does not match a release pattern ;  	exit 1 ; else ; git -C '$(LICENSE_OUTPUT_DIR)' tag -a $(VERSION) -m "$(RELEASE_MESSAGE)" ; git -C '$(LICENSE_OUTPUT_DIR)' push --tags --quiet origin ; fi

.PRECIOUS: licenseListPublisher-%.jar
licenseListPublisher-%.jar:
	curl -L https://dl.bintray.com/spdx/spdx-tools/org/spdx/licenseListPublisher/$*/licenseListPublisher-$*-jar-with-dependencies.jar >$@

.PRECIOUS: licenseListPublisher-%.jar.asc
licenseListPublisher-%.jar.asc:
	curl -L https://dl.bintray.com/spdx/spdx-tools/org/spdx/licenseListPublisher/$*/licenseListPublisher-$*-jar-with-dependencies.jar.asc >$@

.PHONY: licenseListPublisher-%.jar-valid
licenseListPublisher-%.jar-valid: licenseListPublisher-%.jar.asc licenseListPublisher-%.jar goneall.gpg
	gpg --verify --no-default-keyring --keyring ./goneall.gpg $<

$(LICENSE_OUTPUT_DIR):
	mkdir -p $@

resources:
	mkdir -p $@

.PHONY: clean
clean:
	rm -rf $(LICENSE_OUTPUT_DIR)

.PHONY: full-clean
full-clean: clean
	rm -rf resources licenseListPublisher-*.jar*
