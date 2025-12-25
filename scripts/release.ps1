# Release script for opcode (Windows PowerShell version)
# Usage: .\scripts\release.ps1 <version>
# Example: .\scripts\release.ps1 0.2.2

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Function to print colored messages
function Print-Info {
    param([string]$Message)
    Write-Host "ℹ " -ForegroundColor Blue -NoNewline
    Write-Host $Message
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ " -ForegroundColor Red -NoNewline
    Write-Host $Message
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ " -ForegroundColor Yellow -NoNewline
    Write-Host $Message
}

# Validate version format (should be X.Y.Z)
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Print-Error "Invalid version format. Expected format: X.Y.Z (e.g., 0.2.2)"
    exit 1
}

$TagName = "v$Version"

Print-Info "Starting release process for version $Version"
Write-Host ""

# Check if we're in a git repository
try {
    git rev-parse --git-dir 2>&1 | Out-Null
} catch {
    Print-Error "Not in a git repository"
    exit 1
}

# Check if there are uncommitted changes
$gitDiff = git diff-index --quiet HEAD -- 2>&1
if ($LASTEXITCODE -ne 0) {
    Print-Warning "You have uncommitted changes. Please commit or stash them first."
    $response = Read-Host "Do you want to continue anyway? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Print-Info "Release cancelled"
        exit 1
    }
}

# Check if tag already exists
try {
    git rev-parse $TagName 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Print-Error "Tag $TagName already exists"
        exit 1
    }
} catch {}

# Update package.json version
Print-Info "Updating package.json version to $Version..."
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 100 | Set-Content "package.json"
Print-Success "Updated package.json"

# Update Cargo.toml version
Print-Info "Updating src-tauri/Cargo.toml version to $Version..."
$cargoToml = Get-Content "src-tauri/Cargo.toml" -Raw
$cargoToml = $cargoToml -replace 'version\s*=\s*"[^"]*"', "version = `"$Version`""
$cargoToml | Set-Content "src-tauri/Cargo.toml"
Print-Success "Updated src-tauri/Cargo.toml"

# Update Cargo.lock
Print-Info "Updating Cargo.lock..."
Push-Location src-tauri
cargo update -p opcode --quiet
Pop-Location
Print-Success "Updated Cargo.lock"

Write-Host ""
Print-Info "The following files have been updated:"
Write-Host "  - package.json"
Write-Host "  - src-tauri/Cargo.toml"
Write-Host "  - src-tauri/Cargo.lock"
Write-Host ""

# Ask for confirmation
$response = Read-Host "Do you want to commit these changes and create tag $TagName? (y/N)"
if ($response -ne 'y' -and $response -ne 'Y') {
    Print-Warning "Release cancelled. Version files have been updated but not committed."
    exit 1
}

# Commit version changes
Print-Info "Committing version changes..."
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to $Version"
Print-Success "Committed version changes"

# Create tag
Print-Info "Creating tag $TagName..."
git tag -a $TagName -m "Release $TagName"
Print-Success "Created tag $TagName"

Write-Host ""
Print-Warning "Ready to push changes and tag to trigger release workflow"
Write-Host ""
Print-Info "This will:"
Write-Host "  1. Push the version commit to the main branch"
Write-Host "  2. Push the tag $TagName"
Write-Host "  3. Trigger the GitHub Actions release workflow"
Write-Host ""

$response = Read-Host "Do you want to push now? (y/N)"
if ($response -ne 'y' -and $response -ne 'Y') {
    Print-Warning "Changes committed and tagged locally but not pushed."
    Print-Info "To push later, run:"
    Write-Host "  git push origin main"
    Write-Host "  git push origin $TagName"
    exit 0
}

# Push changes
Print-Info "Pushing commit to main branch..."
git push origin main
Print-Success "Pushed commit"

Print-Info "Pushing tag $TagName..."
git push origin $TagName
Print-Success "Pushed tag"

Write-Host ""
Print-Success "Release $TagName has been triggered!"
Write-Host ""

# Get repository URL for helpful links
$repoUrl = git config --get remote.origin.url
$repoPath = $repoUrl -replace '.*github\.com[:/](.*)\.git', '$1'

Print-Info "Next steps:"
Write-Host "  1. Monitor the GitHub Actions workflow at:"
Write-Host "     https://github.com/$repoPath/actions"
Write-Host "  2. Once the workflow completes, review and publish the draft release at:"
Write-Host "     https://github.com/$repoPath/releases"
Write-Host ""
