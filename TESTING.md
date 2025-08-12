# Testing Tides of Battle Module

## Installation Complete! ✅

The Tides of Battle module has been successfully installed to your Foundry VTT modules directory:
`%LOCALAPPDATA%\FoundryVTT\Data\modules\tides-of-battle`

## Next Steps:

1. **Start/Restart Foundry VTT** if it's currently running
2. **Create or Open a World** in Foundry VTT
3. **Enable the Module**:
   - Go to "Game Settings" → "Manage Modules"
   - Find "Tides of Battle" in the list
   - Check the box to enable it
   - Click "Save Module Settings"

## What to Test:

1. **Combat Tracker**: Start a combat encounter and verify the new phase-based system works
2. **Settings**: Check the module settings to ensure all configuration options are available
3. **Localization**: Verify that all text displays correctly (should use "tides-of-battle" keys)
4. **Phase System**: Test the Fast Phase / Slow Phase turn mechanics
5. **Portraits**: Ensure combatant portraits display correctly
6. **Add Events**: Test the event system for adding custom combat events

## For Future Updates:

Run the PowerShell script `install-to-foundry.ps1` from the project directory to quickly update the module in Foundry.

## Troubleshooting:

- If the module doesn't appear, ensure Foundry VTT was restarted after installation
- Check the Foundry console (F12) for any error messages
- Verify the module.json file is valid JSON
