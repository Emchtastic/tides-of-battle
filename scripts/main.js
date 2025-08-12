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

Hooks.on('ready', () => {
    // Socket handler for player phase choices - only set up when game is ready
    game.socket.on("module.tides-of-battle", async (data) => {
        if (!game.user.isGM) return; // Only GM should handle these messages
        
        if (data.type === "setPlayerPhase") {
            try {
                const combat = game.combats.get(data.combatId);
                const combatant = combat?.combatants.get(data.combatantId);
                
                if (combatant) {
                    await combatant.setFlag(MODULE_ID, "phase", data.phase);
                    await combatant.setFlag(MODULE_ID, "playerSelectedPhase", true);
                    console.log(`GM processed phase choice: ${combatant.name} -> ${data.phase} (requested by user ${data.userId})`);
                    
                    // Refresh the combat dock if it exists
                    if (ui.combatDock) {
                        ui.combatDock.render(true);
                    }
                }
            } catch (error) {
                console.error("Error processing player phase choice:", error);
            }
        }
    });

    if(game.combat?.active && !ui.combatDock && game.settings.get("core", "noCanvas")) {
        new CONFIG.combatTrackerDock.CombatDock(game.combat).render(true);
    }
    showWelcome();
});

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
                        // Player sends choice to GM via socket since they can't directly update combatant flags
                        game.socket.emit("module.tides-of-battle", {
                            type: "setPlayerPhase",
                            combatantId: combatant.id,
                            combatId: combatant.combat.id,
                            phase: phaseChoice,
                            userId: game.user.id
                        });
                        
                        console.log(`Player ${game.user.name} selected ${phaseChoice} phase for ${combatant.name}`);
                        
                        // Show feedback to the player
                        const phaseName = phaseChoice === "fast" ? 
                            game.i18n.localize(`${MODULE_ID}.phaseSelection.fastPhase.button`) : 
                            game.i18n.localize(`${MODULE_ID}.phaseSelection.slowPhase.button`);
                        ui.notifications.info(game.i18n.format(`${MODULE_ID}.phaseSelection.notification`, { 
                            name: combatant.name, 
                            phase: phaseName 
                        }));
                    }
                } catch (error) {
                    console.error("Error during phase selection:", error);
                }
            }, 500); // Half second delay to let UI settle
            
            // Don't return here - let the automatic assignment happen first, then the player can override it
        }
        
        // Automatic phase assignment for NPCs, unowned characters, or if dialog was cancelled
        // Only the GM or the combatant owner should set the flag to avoid permission errors
        const canUpdateCombatant = game.user.isGM || combatant.isOwner;
        
        if (!canUpdateCombatant) {
            console.log(`User ${game.user.name} cannot update combatant ${combatant.name}, skipping phase assignment`);
            return;
        }
        
        if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
            defaultPhase = "enemy";
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
            defaultPhase = "fast";
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
            defaultPhase = "fast";
        }
        
        await combatant.setFlag(MODULE_ID, "phase", defaultPhase);
        console.log(`Auto-assigned ${combatant.name} (${disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE ? 'Hostile' : disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY ? 'Friendly' : disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL ? 'Neutral' : 'Unknown'}) to ${defaultPhase} phase`);
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
