import {registerSettings, registerWrappers, registerHotkeys} from './config.js';
import {CombatDock} from './App/Tracker.js';
import {CombatantPortrait} from './App/CombatantPortrait.js';
import {defaultAttributesConfig, generateDescription} from './systems.js';
import {showWelcome} from './lib/welcome.js';

export const MODULE_ID = 'tides-of-battle';

Hooks.once('init', function () {
    registerWrappers();
    registerHotkeys();
    CONFIG.combatTrackerDock = {
        CombatDock,
        CombatantPortrait,
        defaultAttributesConfig,
        generateDescription,
        INTRO_ANIMATION_DURATION: 1000,
        INTRO_ANIMATION_DELAY: 0.25,
    }

    Hooks.callAll(`${MODULE_ID}-init`, CONFIG.combatTrackerDock);
});

Hooks.once('setup', registerSettings);

Hooks.on('createCombat', (combat) => {
    console.log("createCombat hook triggered for combat:", combat.id);
    if (game.combat === combat) {
        console.log("Creating new CombatDock for combat:", combat.id);
        new CONFIG.combatTrackerDock.CombatDock(combat).render(true);
    } else {
        console.log("Combat is not the active combat, skipping dock creation");
    }
});

// Additional hooks for robustness
Hooks.on('updateCombat', (combat, updateData) => {
    // If this combat just became the active one
    if (game.combat === combat && !ui.combatDock) {
        console.log("updateCombat: Combat became active, ensuring dock exists");
        ensureCombatDockExists();
    }
});

// Hook for when combat starts
Hooks.on('combatStart', (combat) => {
    console.log("combatStart hook triggered for combat:", combat.id);
    ensureCombatDockExists();
});

// Hook for when user switches between scenes/combats
Hooks.on('canvasReady', () => {
    // Small delay to ensure everything is loaded
    setTimeout(() => {
        ensureCombatDockExists();
    }, 100);
});

// Robust function to ensure combat dock exists when needed
function ensureCombatDockExists() {
    if (!ui.combatDock) {
        console.log("ensureCombatDockExists: Creating combat dock", game.combat ? `for active combat: ${game.combat.id}` : "for encounter creation");
        new CONFIG.combatTrackerDock.CombatDock(game.combat).render(true);
        return true;
    }
    return false;
}

Hooks.on('ready', () => {
    console.log("=== SETTING UP PHASE SELECTION SYSTEM ===");
    console.log("User is GM:", game.user?.isGM);
    
    // Set up update hook to watch for phase selection requests
    if (game.user.isGM) {
        console.log("Setting up GM phase selection processor");
        
        // Watch for combatant updates that contain phase selection requests
        Hooks.on('updateCombatant', (combatant, updateData, options, userId) => {
            console.log("=== COMBATANT UPDATE DETECTED ===");
            
            // Check if this update contains a phase selection request
            const pendingPhaseChoice = updateData.flags?.[MODULE_ID]?.pendingPhaseChoice;
            if (pendingPhaseChoice) {
                console.log("=== PROCESSING PHASE SELECTION REQUEST ===");
                console.log("Combatant:", combatant.name);
                console.log("Requested phase:", pendingPhaseChoice);
                console.log("Requested by user:", userId);
                
                // Process the phase selection
                (async () => {
                    try {
                        // Set the actual phase
                        await combatant.setFlag(MODULE_ID, "phase", pendingPhaseChoice);
                        await combatant.setFlag(MODULE_ID, "playerSelectedPhase", true);
                        
                        // Clear the pending request
                        await combatant.unsetFlag(MODULE_ID, "pendingPhaseChoice");
                        
                        console.log(`GM processed phase choice: ${combatant.name} -> ${pendingPhaseChoice} (requested by user ${userId})`);
                        
                        // Check if all players have now selected their phases
                        await checkAllPlayersReady(combatant.combat);
                        
                        // Refresh the combat dock if it exists
                        if (ui.combatDock) {
                            ui.combatDock.render(true);
                        }
                        
                        // Send confirmation to the requesting player
                        ui.notifications.info(`Phase set for ${combatant.name}: ${pendingPhaseChoice}`);
                        
                    } catch (error) {
                        console.error("Error processing phase selection request:", error);
                        // Clear the pending request even if there was an error
                        try {
                            await combatant.unsetFlag(MODULE_ID, "pendingPhaseChoice");
                        } catch (clearError) {
                            console.error("Error clearing pending phase choice:", clearError);
                        }
                    }
                })();
            }
        });
        
        console.log("GM phase selection processor ready");
        
        // Note: Round advancement re-prompting is now handled directly in Tracker.nextPhase()
        console.log("Using direct re-prompting in Tracker (not hook-based)");
        
        console.log("Round advancement watcher ready");
    } else {
        console.log("Player client - no GM processor needed");
    }
    
    // All clients (GM and players) watch for phase selection prompts
    Hooks.on('updateCombatant', (combatant, updateData, options, userId) => {
        console.log("=== UPDATE COMBATANT HOOK TRIGGERED ===");
        console.log("Combatant:", combatant.name);
        console.log("Update data:", updateData);
        console.log("Current user:", game.user.name);
        console.log("Is GM:", game.user.isGM);
        
        // Check if this combatant needs phase selection and is owned by current user
        const needsPhaseSelection = updateData.flags?.[MODULE_ID]?.needsPhaseSelection;
        console.log("Needs phase selection flag:", needsPhaseSelection);
        
        if (needsPhaseSelection && !game.user.isGM) {
            console.log("=== PHASE SELECTION NEEDED DETECTED ===");
            
            // Check if this combatant is owned by the current user
            const isOwnedByCurrentUser = combatant.actor?.ownership?.[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
            console.log("Is owned by current user:", isOwnedByCurrentUser);
            console.log("Actor ownership:", combatant.actor?.ownership);
            console.log("Current user ID:", game.user.id);
            
            if (isOwnedByCurrentUser) {
                console.log(`Prompting ${game.user.name} for phase choice for ${combatant.name} (new round)`);
                
                // Delay the prompt slightly to ensure the flag update has been processed
                setTimeout(async () => {
                    try {
                        const phaseChoice = await promptPhaseSelection(combatant);
                        if (phaseChoice) {
                            // Player sends choice to GM via combatant flag update
                            console.log("=== SETTING PHASE SELECTION REQUEST (NEW ROUND) ===");
                            console.log("Phase choice:", phaseChoice);
                            console.log("Combatant:", combatant.name);
                            
                            try {
                                // Set a pending phase choice flag that the GM will detect
                                await combatant.setFlag(MODULE_ID, "pendingPhaseChoice", phaseChoice);
                                // Clear the needs selection flag
                                await combatant.unsetFlag(MODULE_ID, "needsPhaseSelection");
                                
                                console.log("Phase selection request set successfully (new round)");
                                
                                // Show feedback to the player
                                const phaseName = phaseChoice === "fast" ? 
                                    game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`) : 
                                    game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`);
                                ui.notifications.info(game.i18n.format(`${MODULE_ID}.phaseSelection.notification`, { 
                                    name: combatant.name, 
                                    phase: phaseName 
                                }));
                                
                            } catch (flagError) {
                                console.error("Error setting phase choice flag:", flagError);
                                console.log("Permission denied - trying alternative approach");
                                
                                // Fallback: Use socket communication as backup
                                if (game.socket) {
                                    console.log("Sending phase choice via socket as fallback");
                                    game.socket.emit(`module.${MODULE_ID}`, {
                                        type: "phaseChoice",
                                        combatantId: combatant.id,
                                        combatId: combatant.combat.id,
                                        choice: phaseChoice,
                                        userId: game.user.id,
                                        userName: game.user.name
                                    });
                                    
                                    // Show feedback to the player
                                    const phaseName = phaseChoice === "fast" ? 
                                        game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`) : 
                                        game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`);
                                    ui.notifications.info(`Phase choice sent to GM: ${phaseName}`);
                                } else {
                                    ui.notifications.error(`Could not set phase choice: ${flagError.message}`);
                                }
                            }
                        } else {
                            // Player cancelled, clear the needs selection flag
                            await combatant.unsetFlag(MODULE_ID, "needsPhaseSelection");
                        }
                    } catch (error) {
                        console.error("Error during new round phase selection:", error);
                    }
                }, 500);
            } else {
                console.log("Not owned by current user, skipping prompt");
            }
        } else {
            console.log("No phase selection needed or user is GM");
        }
    });
    
    console.log("Phase selection prompt watcher ready");
    
    // Socket fallback handler for permission errors
    if (game.user.isGM) {
        game.socket.on(`module.${MODULE_ID}`, async (data) => {
            console.log("=== SOCKET FALLBACK MESSAGE RECEIVED ===", data);
            
            if (data.type === "phaseChoice") {
                const combat = game.combats.get(data.combatId);
                const combatant = combat?.combatants.get(data.combatantId);
                
                if (combatant) {
                    try {
                        // GM processes the phase choice
                        await combatant.setFlag(MODULE_ID, "phase", data.choice);
                        await combatant.setFlag(MODULE_ID, "playerSelectedPhase", true);
                        await combatant.unsetFlag(MODULE_ID, "needsPhaseSelection");
                        
                        console.log(`Socket fallback: Processed phase choice for ${combatant.name}: ${data.choice}`);
                        
                        // Notify the GM
                        ui.notifications.info(`${data.userName} selected ${data.choice} phase for ${combatant.name} (via fallback)`);
                        
                    } catch (error) {
                        console.error("Error processing socket fallback phase choice:", error);
                    }
                }
            }
        });
        console.log("Socket fallback handler registered");
    }
    
    // Test the system
    setTimeout(() => {
        console.log("=== TESTING PHASE SELECTION SYSTEM ===");
        console.log("Current user:", game.user?.name);
        console.log("Is GM:", game.user?.isGM);
        console.log("System ready for phase selections");
    }, 2000);

    // Ensure combat dock exists if there's an active combat
    ensureCombatDockExists();
    
    // Additional safety net - periodic check for missing combat dock
    setInterval(() => {
        if (!ui.combatDock) {
            console.log("Periodic check: No combat dock found, creating one");
            ensureCombatDockExists();
        }
    }, 5000); // Check every 5 seconds
    
    // Additional robustness: Clean up any orphaned pending phase choices on startup
    if (game.user.isGM) {
        setTimeout(() => {
            console.log("=== CLEANING UP ORPHANED PHASE REQUESTS ===");
            
            // Check if there's an active combat before proceeding
            if (game.combat && game.combat.combatants) {
                console.log(`Checking ${game.combat.combatants.size} combatants for orphaned phase requests`);
                game.combat.combatants.forEach(combatant => {
                    const pendingChoice = combatant.getFlag(MODULE_ID, "pendingPhaseChoice");
                    if (pendingChoice) {
                        console.log(`Found orphaned phase request for ${combatant.name}: ${pendingChoice}`);
                        // Process it immediately
                        (async () => {
                            try {
                                await combatant.setFlag(MODULE_ID, "phase", pendingChoice);
                                await combatant.setFlag(MODULE_ID, "playerSelectedPhase", true);
                                await combatant.unsetFlag(MODULE_ID, "pendingPhaseChoice");
                                console.log(`Processed orphaned phase request: ${combatant.name} -> ${pendingChoice}`);
                            } catch (error) {
                                console.error("Error processing orphaned phase request:", error);
                            }
                        })();
                    }
                });
            } else {
                console.log("No active combat found, skipping orphaned phase request cleanup");
            }
        }, 5000);
    }
    
    showWelcome();
});

// Expose the reprompt function globally for access from other modules
window.tidesOfBattle = window.tidesOfBattle || {};
window.tidesOfBattle.repromptAllPlayersForPhase = repromptAllPlayersForPhase;

// Function to re-prompt all players for their phase at the start of a new round
async function repromptAllPlayersForPhase(combat) {
    console.log("=== RE-PROMPTING ALL PLAYERS FOR PHASE ===");
    console.log("Round:", combat.round);
    
    if (!combat || !combat.combatants) {
        console.log("No valid combat found, skipping re-prompt");
        return;
    }
    
    // Set a flag to indicate we're in phase re-selection mode
    await combat.setFlag(MODULE_ID, "awaitingPhaseSelection", true);
    
    const playerCombatants = combat.combatants.filter(combatant => {
        const isPlayerCharacter = combatant.actor?.hasPlayerOwner;
        const hasPlayerOwner = isPlayerCharacter && combatant.actor?.ownership;
        
        if (!hasPlayerOwner) return false;
        
        // Find the player who owns this combatant
        const ownerIds = Object.entries(combatant.actor.ownership)
            .filter(([userId, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== "default")
            .map(([userId]) => userId);
            
        return ownerIds.length > 0;
    });
    
    console.log(`Found ${playerCombatants.length} player combatants to re-prompt`);
    
    // Clear existing phase selections and prompt each player
    for (const combatant of playerCombatants) {
        try {
            console.log(`Re-prompting for ${combatant.name}`);
            
            // Clear the existing phase selection flags (GM has permission to do this)
            await combatant.unsetFlag(MODULE_ID, "phase");
            await combatant.unsetFlag(MODULE_ID, "playerSelectedPhase");
            
            // Set a flag to trigger the prompt for the owning player
            await combatant.setFlag(MODULE_ID, "needsPhaseSelection", true);
            
            console.log(`Phase selection reset for ${combatant.name}`);
            
        } catch (error) {
            console.error(`Error resetting phase for ${combatant.name}:`, error);
            // Continue with other combatants even if one fails
        }
    }
    
    // Notify all players about the new round
    ui.notifications.info(`Round ${combat.round} - Please select your phase!`);
    
    console.log("All players re-prompted for phase selection");
}

// Check if all players have selected their phases and clear the awaiting flag
async function checkAllPlayersReady(combat) {
    if (!combat || !game.user.isGM) return;
    
    const awaitingPhaseSelection = combat.getFlag(MODULE_ID, "awaitingPhaseSelection");
    if (!awaitingPhaseSelection) return; // Not in re-selection mode
    
    console.log("=== CHECKING IF ALL PLAYERS ARE READY ===");
    
    const playerCombatants = combat.combatants.filter(combatant => {
        return combatant.actor?.hasPlayerOwner;
    });
    
    const playersWithPhases = playerCombatants.filter(combatant => {
        return combatant.getFlag(MODULE_ID, "playerSelectedPhase");
    });
    
    console.log(`Players ready: ${playersWithPhases.length}/${playerCombatants.length}`);
    
    if (playersWithPhases.length >= playerCombatants.length) {
        console.log("All players have selected their phases - finishing round advancement");
        
        // Call the combat tracker to finish the round advancement
        if (ui.combatDock && ui.combatDock.finishRoundAdvancement) {
            await ui.combatDock.finishRoundAdvancement();
        } else {
            // Fallback: clear the flag manually
            await combat.unsetFlag(MODULE_ID, "awaitingPhaseSelection");
            
            // Refresh the combat dock
            if (ui.combatDock) {
                ui.combatDock.render(true);
            }
            
            ui.notifications.info("All players have selected their phases. Combat tracker is now visible!");
        }
    }
}

// Set default phase for new combatants based on disposition, with player choice
Hooks.on('createCombatant', async (combatant) => {
    console.log("createCombatant hook triggered for:", combatant.name, "in combat:", combatant.combat?.id);
    
    // Check if the combat dock exists, if not and this is the active combat, create it
    if (!ui.combatDock && combatant.combat === game.combat) {
        console.log("No combat dock exists but this is active combat, creating one");
        new CONFIG.combatTrackerDock.CombatDock(combatant.combat).render(true);
    }
    
    if (!combatant.getFlag(MODULE_ID, "phase")) {
        let defaultPhase = "fast"; // Default fallback
        
        // Check if this is a player character that the current user specifically owns
        const isPlayerCharacter = combatant.actor?.hasPlayerOwner;
        const isSpecificallyOwnedByCurrentUser = combatant.actor?.ownership?.[game.user.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        const disposition = combatant.token?.disposition;
        
        console.log(`Processing new combatant: ${combatant.name}`);
        console.log(`- Is player character: ${isPlayerCharacter}`);
        console.log(`- Is specifically owned by current user (${game.user.name}): ${isSpecificallyOwnedByCurrentUser}`);
        console.log(`- Current user is GM: ${game.user.isGM}`);
        console.log(`- Disposition: ${disposition}`);
        
        if (isPlayerCharacter && isSpecificallyOwnedByCurrentUser && !game.user.isGM) {
            // This is a player character owned by the current user (not GM) - prompt for phase choice
            console.log(`Prompting ${game.user.name} for phase choice for ${combatant.name}`);
            
            // Delay the prompt slightly to ensure the combat tracker has time to render
            setTimeout(async () => {
                try {
                    const phaseChoice = await promptPhaseSelection(combatant);
                    if (phaseChoice) {
                        // Player sends choice to GM via combatant flag update
                        console.log("=== SETTING PHASE SELECTION REQUEST ===");
                        console.log("Phase choice:", phaseChoice);
                        console.log("Combatant:", combatant.name);
                        
                        try {
                            // Set a pending phase choice flag that the GM will detect
                            await combatant.setFlag(MODULE_ID, "pendingPhaseChoice", phaseChoice);
                            
                            console.log("Phase selection request set successfully");
                            console.log(`Player ${game.user.name} requested ${phaseChoice} phase for ${combatant.name}`);
                            
                            // Show feedback to the player
                            const phaseName = phaseChoice === "fast" ? 
                                game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`) : 
                                game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`);
                            ui.notifications.info(game.i18n.format(`${MODULE_ID}.phaseSelection.notification`, { 
                                name: combatant.name, 
                                phase: phaseName 
                            }));
                            
                        } catch (flagError) {
                            console.error("Error setting phase choice flag:", flagError);
                            console.log("Permission denied - trying socket fallback");
                            
                            // Fallback: Use socket communication as backup
                            if (game.socket) {
                                console.log("Sending phase choice via socket as fallback");
                                game.socket.emit(`module.${MODULE_ID}`, {
                                    type: "phaseChoice",
                                    combatantId: combatant.id,
                                    combatId: combatant.combat.id,
                                    choice: phaseChoice,
                                    userId: game.user.id,
                                    userName: game.user.name
                                });
                                
                                // Show feedback to the player
                                const phaseName = phaseChoice === "fast" ? 
                                    game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`) : 
                                    game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`);
                                ui.notifications.info(`Phase choice sent to GM: ${phaseName}`);
                            } else {
                                ui.notifications.error(`Could not set phase choice: ${flagError.message}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error during phase selection:", error);
                }
            }, 500); // Half second delay to let UI settle
            
            // For player characters, we only prompt - never auto-assign
            return;
        }
        
        // Auto-assignment is ONLY for NPCs (non-player characters)
        if (isPlayerCharacter) {
            console.log(`${combatant.name} is a player character but no dialog shown (likely GM-owned token). Skipping auto-assignment - players must choose their own phases.`);
            return;
        }
        
        // Only auto-assign phases to NPCs
        // Only the GM or the combatant owner should set the flag to avoid permission errors
        const canUpdateCombatant = game.user.isGM || combatant.isOwner;
        
        if (!canUpdateCombatant) {
            console.log(`User ${game.user.name} cannot update combatant ${combatant.name}, skipping phase assignment`);
            return;
        }
        
        // Check if phase already set to avoid duplicate assignments
        const existingPhase = combatant.getFlag(MODULE_ID, "phase");
        
        if (existingPhase) {
            console.log(`${combatant.name} already has phase assigned: ${existingPhase}, skipping auto-assignment`);
            return;
        }
        
        // Auto-assign phase for NPCs based on disposition
        if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
            defaultPhase = "enemy";
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
            defaultPhase = "fast";
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
            defaultPhase = "fast";
        }
        
        await combatant.setFlag(MODULE_ID, "phase", defaultPhase);
        console.log(`Auto-assigned NPC ${combatant.name} (${disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? 'Hostile' : disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? 'Friendly' : disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL ? 'Neutral' : 'Unknown'}) to ${defaultPhase} phase`);
    }
});

// Function to prompt players for phase selection
async function promptPhaseSelection(combatant) {
    return new Promise((resolve) => {
        const dialog = new Dialog({
            title: game.i18n.format(`${MODULE_ID}.phaseSelection.title`, { name: combatant.name }),
            content: `
                <div style="text-align: center; margin: 20px 0;">
                    <h3>${game.i18n.localize(`${MODULE_ID}.phaseSelection.choosePhase`)}</h3>
                    <p>${game.i18n.format(`${MODULE_ID}.phaseSelection.description`, { name: combatant.name })}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 15px; margin: 20px 0;">
                    <div style="border: 2px solid #4a90e2; border-radius: 8px; padding: 15px; background: rgba(74, 144, 226, 0.1);">
                        <h4 style="margin: 0 0 10px 0; color: #4a90e2;">${game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.title`)}</h4>
                        <p style="margin: 0; font-size: 14px;">
                            ${game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.description`)}
                        </p>
                    </div>
                    <div style="border: 2px solid #e74c3c; border-radius: 8px; padding: 15px; background: rgba(231, 76, 60, 0.1);">
                        <h4 style="margin: 0 0 10px 0; color: #e74c3c;">${game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.title`)}</h4>
                        <p style="margin: 0; font-size: 14px;">
                            ${game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.description`)}
                        </p>
                    </div>
                </div>
                <p style="text-align: center; font-style: italic; color: #666; margin-top: 20px;">
                    ${game.i18n.localize(`${MODULE_ID}.phaseSelection.advice`)}
                </p>
            `,
            buttons: {
                fast: {
                    icon: '<i class="fas fa-bolt"></i>',
                    label: game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`),
                    callback: () => resolve("fast")
                },
                slow: {
                    icon: '<i class="fas fa-hourglass-half"></i>',
                    label: game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`),
                    callback: () => resolve("slow")
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => resolve(null)
                }
            },
            default: "fast",
            close: () => resolve(null)
        });
        
        dialog.render(true);
    });
}

Hooks.on('updateCombat', (combat, updates) => {
    if(updates.active || updates.scene === null) {
        new CONFIG.combatTrackerDock.CombatDock(combat).render(true);
    }
    if(updates.scene && combat.scene !== game.scenes.viewed && ui.combatDock?.combat === combat) {
        ui.combatDock.close();
    }
    
    // Initialize phase when combat starts
    if(updates.active === true && !combat.getFlag(MODULE_ID, "currentPhase")) {
        combat.setFlag(MODULE_ID, "currentPhase", "fast");
    }
    
    // Clear rotating dice when combat ends
    if(updates.active === false) {
        clearAllRotatingDice();
    }
});

// Helper function to clear all turn indicators from tokens
function clearAllRotatingDice() {
    canvas.tokens.placeables.forEach(token => {
        // Use native method if available
        if (typeof token.clearTurnIndicator === 'function') {
            token.clearTurnIndicator();
        } else {
            // Manual cleanup for custom indicators
            const existingIndicator = token.children.find(child => 
                child.name === "turnIndicator" || child.name === "activeIndicator"
            );
            if (existingIndicator) {
                token.removeChild(existingIndicator);
            }
        }
    });
    console.log("Cleared all turn indicators");
}

Hooks.on('canvasReady', () => {
    Hooks.once("renderCombatTracker", (tab) => {
            if(game.combat?.active) {
                new CONFIG.combatTrackerDock.CombatDock(game.combat).render(true);
            } else {
                ui.combatDock?.close();
            }
    })
});

Hooks.on('ready', () => {
    if(game.combat?.active && !ui.combatDock && game.settings.get("core", "noCanvas")) {
        new CONFIG.combatTrackerDock.CombatDock(game.combat).render(true);
    }
    showWelcome();
});

function getCTFormData(app){

}

Hooks.on("renderCombatTrackerConfig", (app, html, data) => {
    if (!game.user.isGM) return;
    const attributes = TokenDocument.implementation.getTrackedAttributes();
    attributes.bar.forEach(a => a.push("value"));
    const attributeChoices = TokenDocument.implementation.getTrackedAttributeChoices(attributes)
    attributeChoices.unshift({label: "None", value: ""})
    const attributeBarChoices = TokenDocument.implementation.getTrackedAttributeChoices({bar: attributes.bar, value: []})
    attributeBarChoices.unshift({label: "None", value: ""})
    const compiled = Handlebars.compile(`<select name="flags.${MODULE_ID}.resource">{{selectOptions options selected=value}}</select>`)
    const compiled2 = Handlebars.compile(`<select name="flags.${MODULE_ID}.portraitResource">{{selectOptions options selected=value}}</select>`)
    const selectResourceHtml = compiled({options: attributeChoices, value: game.settings.get(MODULE_ID, "resource")})
    const portraitResource = game.settings.get(MODULE_ID, "portraitResource");
    const selectPortraitResourceHtml = compiled2({options: attributeBarChoices, value: portraitResource})

    const fg = document.createElement("div");
    fg.classList.add("form-group");
    fg.innerHTML = `
    <label>${game.i18n.localize('COMBAT.CONFIG.FIELDS.core.combatTrackerConfig.resource.label')} 2</label>
    ${selectResourceHtml}
    <p class="hint">${game.i18n.localize('COMBAT.CONFIG.FIELDS.core.combatTrackerConfig.resource.hint')}</p>
    `;

    html.querySelector(`select[name="core.combatTrackerConfig.resource"]`).closest(".form-group").appendChild(fg);

    const portraitFg = document.createElement("div");
    portraitFg.classList.add("form-group");
    portraitFg.innerHTML = `
    <label>${game.i18n.localize(`${MODULE_ID}.combatConfig.portraitResource.label`)}</label>
    ${selectPortraitResourceHtml}
    <p class="hint">${game.i18n.localize(`${MODULE_ID}.combatConfig.portraitResource.hint`)}</p>
    `;

    html.querySelector(`select[name="flags.${MODULE_ID}.resource"]`).closest(".form-group").appendChild(portraitFg);

    const button = document.createElement("button");
    button.innerHTML = `<i class="fa-solid fa-gears"></i> ` + game.i18n.localize(`${MODULE_ID}.configureCarousel`);

    button.addEventListener("click", (e) => {
        e.preventDefault();
        new SettingsConfig().render(true)
        Hooks.once("renderSettingsConfig", (app, html, data) => {
            html.querySelector('button[data-tab="tides-of-battle"]').click();
        });
    });

    //find last form group
    const lastFormGroup = html.querySelectorAll(".form-group")[html.querySelectorAll(".form-group").length - 1];
    lastFormGroup.appendChild(button);

    html.querySelector(`select[name="flags.${MODULE_ID}.resource"]`).addEventListener("change", async (event) => {
        await game.settings.set(MODULE_ID, "resource", event.target.value);
    });

    html.querySelector(`select[name="flags.${MODULE_ID}.portraitResource"]`).addEventListener("change", async (event) => {
        await game.settings.set(MODULE_ID, "portraitResource", event.target.value);
    });

    app.setPosition({height: "auto"});
});
