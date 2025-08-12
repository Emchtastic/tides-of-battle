# PowerShell script to install Tides of Battle module to Foundry VTT
# Run this script whenever you want to update the module in Foundry
# Use -AutoCommit to automatically stage, commit, and push changes to git

param(
    [switch]$AutoCommit,
    [string]$CommitMessage = "Update module installation"
)

$sourceDir = $PSScriptRoot
$targetDir = "$env:LOCALAPPDATA\FoundryVTT\Data\modules\tides-of-battle"

# Auto-commit functionality
if ($AutoCommit) {
    Write-Host "Auto-commit enabled. Checking for changes..."
    
    # Check if there are any changes to commit
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Host "Staging changes..."
        git add .
        
        Write-Host "Committing changes..."
        git commit -m $CommitMessage
        
        Write-Host "Pushing to remote repository..."
        git push
        
        Write-Host "Git operations completed successfully!"
    } else {
        Write-Host "No changes to commit."
    }
    Write-Host ""
}

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

Write-Host "Module installed successfully!"
Write-Host "You can now enable 'Tides of Battle' in Foundry VTT's Module Management."
Write-Host ""
Write-Host "Note: If Foundry is running, you may need to restart it to see the module."
Write-Host ""
Write-Host "Usage examples:"
Write-Host "   .\install-to-foundry.ps1                    # Install module only"
Write-Host "   .\install-to-foundry.ps1 -AutoCommit        # Install + auto-commit with default message"
Write-Host "   .\install-to-foundry.ps1 -AutoCommit -CommitMessage `"Custom message`"   # Install + custom commit"
