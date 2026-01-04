#!/bin/bash

# Release script for opcode
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 0.2.2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if version argument is provided
if [ -z "$1" ]; then
    print_error "Version argument is required"
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.2"
    exit 1
fi

VERSION=$1

# Validate version format (should be X.Y.Z)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Expected format: X.Y.Z (e.g., 0.2.2)"
    exit 1
fi

TAG_NAME="v${VERSION}"

print_info "Starting release process for version ${VERSION}"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_warning "You have uncommitted changes. Please commit or stash them first."
    read -p "Do you want to continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Release cancelled"
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    print_error "Tag ${TAG_NAME} already exists"
    exit 1
fi

# Update package.json version
print_info "Updating package.json version to ${VERSION}..."
if command -v jq >/dev/null 2>&1; then
    # Use jq if available (more robust)
    jq ".version = \"${VERSION}\"" package.json > package.json.tmp && mv package.json.tmp package.json
else
    # Fallback to sed
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
    rm -f package.json.bak
fi
print_success "Updated package.json"

# Update Cargo.toml version
print_info "Updating src-tauri/Cargo.toml version to ${VERSION}..."
sed -i.bak "s/^version = \".*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak
print_success "Updated src-tauri/Cargo.toml"

# Update Cargo.lock
print_info "Updating Cargo.lock..."
cd src-tauri
cargo update -p opcode --quiet
cd ..
print_success "Updated Cargo.lock"

echo ""
print_info "The following files have been updated:"
echo "  - package.json"
echo "  - src-tauri/Cargo.toml"
echo "  - src-tauri/Cargo.lock"
echo ""

# Ask for confirmation
read -p "Do you want to commit these changes and create tag ${TAG_NAME}? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Release cancelled. Version files have been updated but not committed."
    exit 1
fi

# Commit version changes
print_info "Committing version changes..."
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to ${VERSION}"
print_success "Committed version changes"

# Create tag
print_info "Creating tag ${TAG_NAME}..."
git tag -a "${TAG_NAME}" -m "Release ${TAG_NAME}"
print_success "Created tag ${TAG_NAME}"

echo ""
print_warning "Ready to push changes and tag to trigger release workflow"
echo ""
print_info "This will:"
echo "  1. Push the version commit to the main branch"
echo "  2. Push the tag ${TAG_NAME}"
echo "  3. Trigger the GitHub Actions release workflow"
echo ""

read -p "Do you want to push now? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Changes committed and tagged locally but not pushed."
    print_info "To push later, run:"
    echo "  git push origin main"
    echo "  git push origin ${TAG_NAME}"
    exit 0
fi

# Push changes
print_info "Pushing commit to main branch..."
git push origin main
print_success "Pushed commit"

print_info "Pushing tag ${TAG_NAME}..."
git push origin "${TAG_NAME}"
print_success "Pushed tag"

echo ""
print_success "Release ${TAG_NAME} has been triggered!"
echo ""
print_info "Next steps:"
echo "  1. Monitor the GitHub Actions workflow at:"
echo "     https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo "  2. Once the workflow completes, review and publish the draft release at:"
echo "     https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases"
echo ""
