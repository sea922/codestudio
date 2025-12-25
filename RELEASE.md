# Release Process

This document describes how to create a new release of opcode.

## Quick Start

### Using the Release Script

The easiest way to create a release is using the automated release script:

**Linux/macOS:**
```bash
npm run release 0.2.2
# or
./scripts/release.sh 0.2.2
```

**Windows (PowerShell):**
```powershell
.\scripts\release.ps1 0.2.2
```

The script will:
1. Update version in `package.json` and `src-tauri/Cargo.toml`
2. Update `Cargo.lock`
3. Commit the changes
4. Create and push a git tag (e.g., `v0.2.2`)
5. Trigger the GitHub Actions release workflow

## Manual Release Process

If you prefer to create a release manually:

1. **Update version numbers:**
   ```bash
   # Update package.json
   # Update src-tauri/Cargo.toml

   # Update Cargo.lock
   cd src-tauri
   cargo update -p opcode
   cd ..
   ```

2. **Commit the changes:**
   ```bash
   git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "chore: bump version to X.Y.Z"
   ```

3. **Create and push the tag:**
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

## CI/CD Workflow

When a tag matching `v*` is pushed to the repository, the GitHub Actions workflow will automatically:

1. **Build for all platforms:**
   - Windows (x86_64)
   - macOS (Universal binary: Apple Silicon + Intel)
   - Linux (x86_64)

2. **Create artifacts:**
   - Windows: `.msi` installer and `.exe` portable
   - macOS: `.dmg` and `.app.tar.gz`
   - Linux: `.AppImage` and `.deb`

3. **Create a draft release:**
   - All artifacts are attached
   - SHA256 checksums are generated
   - Release notes are auto-generated from commits

4. **Publish the release:**
   - Review the draft release on GitHub
   - Edit the release notes if needed
   - Publish the release

## Workflow Files

The CI/CD setup consists of the following workflows:

- `.github/workflows/release.yml` - Main release orchestration workflow
- `.github/workflows/build-windows.yml` - Windows build job
- `.github/workflows/build-macos.yml` - macOS build job (with code signing)
- `.github/workflows/build-linux.yml` - Linux build job

## Version Format

Versions should follow semantic versioning: `MAJOR.MINOR.PATCH`

Examples:
- `0.2.1` - Current version
- `0.2.2` - Patch release (bug fixes)
- `0.3.0` - Minor release (new features)
- `1.0.0` - Major release (breaking changes)

## Troubleshooting

### Tag already exists
If you need to recreate a tag:
```bash
git tag -d vX.Y.Z                 # Delete local tag
git push origin :refs/tags/vX.Y.Z # Delete remote tag
```

### Build fails
- Check the GitHub Actions logs
- Ensure all dependencies are properly specified
- Verify that secrets (e.g., Apple certificates for macOS) are configured

### Release not created
- Ensure the tag starts with `v` (e.g., `v0.2.2`)
- Check that the release workflow has proper permissions
- Verify that all platform builds succeeded
