.PHONY: all build test clean dist

all: build

build:
	./scripts/build.sh

test:
	node test/test-make.js
	node test/test-recipes.js
	node examples/host-reference.js

clean:
	rm -rf build dist bin/make.wasm

dist: build
	mkdir -p dist
	tar -czf dist/make-wasi-4.4.1.tar.gz -C . bin/make.wasm bin/cli.js src/host.js package.json README.md SPEC.md docs examples
	npm pack --pack-destination dist/
