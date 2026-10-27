# List development and release commands.
default:
    @just --list

# Regenerate parser sources from grammar.js.
generate:
    pnpm exec tree-sitter generate

# Run all binding and maintenance-script suites with existing dependencies.
test: test-node test-rust test-python test-go test-swift test-scripts

test-node:
    pnpm test

test-rust:
    cargo test --locked --offline

test-python:
    uv run --no-sync python -m unittest discover -s bindings/python/tests -v

test-go:
    go test -a -mod=readonly -count=1 ./bindings/go

test-swift:
    swift test --disable-automatic-resolution

test-scripts:
    uv run --no-sync python -m unittest discover -s scripts/tests -v

# Run Tree-sitter corpus tests.
test-grammar:
    pnpm exec tree-sitter test

# Update package versions and regenerate parser metadata.
version $NEW_VERSION:
    uv run --no-project --offline python scripts/set_version.py
    just generate

# Create and push a tag after confirmation.
tag $RELEASE_TAG:
    uv run --no-project --offline python scripts/tag.py tag

# Delete a local and remote tag after confirmation.
dtag $RELEASE_TAG:
    uv run --no-project --offline python scripts/tag.py dtag
