# PowerShell script to install Tides of Battle module to Foundry VTT
# Run this script whenever you want to update the module in Foundry

$sourceDir = $PSScriptRoot
$targetDir = "$env:LOCALAPPDATA\FoundryVTT\Data\modules\tides-of-battle"

Write-Host "Installing Tides of Battle module to Foundry VTT..."
Write-Host "Source: $sourceDir"
Write-Host "Target: $targetDir"

# Remove existing installation if it exists
if (Test-Path $targetDir) {
    Write-Host "Removing existing installation..."
    Remove-Item -Recurse -Force $targetDir
}

# Create target directory
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

# Copy all files except .git directory
Write-Host "Copying module files..."
Get-ChildItem -Path $sourceDir -Exclude ".git", ".gitignore", "install-to-foundry.ps1" | 
    Copy-Item -Destination $targetDir -Recurse -Force

Write-Host "✅ Module installed successfully!"
Write-Host "You can now enable 'Tides of Battle' in Foundry VTT's Module Management."
Write-Host ""
Write-Host "Note: If Foundry is running, you may need to restart it to see the module."
