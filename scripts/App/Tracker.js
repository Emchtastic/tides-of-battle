import { MODULE_ID } from "../main.js";
import { AddEvent } from "./AddEvent.js";

// Phase constants
const PHASES = {
    FAST: "fast",
    ENEMY: "enemy", 
    SLOW: "slow"
};

const PHASE_ORDER = [PHASES.FAST, PHASES.ENEMY, PHASES.SLOW];

export class CombatDock extends Application {
    constructor(combat) {
        super();
        ui.combatDock?.close();
        ui.combatDock = this;
        this.portraits = [];
        this.combat = combat ?? game.combat;
        this.hooks = [];
        this._playAnimation = true;
        this._currentPortraitSize = {
            max: parseInt(game.settings.get(MODULE_ID, "portraitSize")),
            aspect: game.settings.get(MODULE_ID, "portraitAspect"),
        };
        this.setHooks();
        window.addEventListener("resize", this.autosize.bind(this));
        this._combatTrackerRefreshed = false;
    }

    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            id: "combat-dock",
            classes: ["combat-dock"],
            template: `modules/tides-of-battle/templates/combat-tracker.hbs`,
            resizable: false,
            popOut: false,
        };
    }

    get sortedCombatants() {
        if (!this.combat) return [];
        const allCombatants = Array.from(this.combat.combatants.contents.sort(this.combat._sortCombatants));
        // Filter combatants by current phase
        return allCombatants.filter(combatant => this.getCombatantPhase(combatant) === this.currentPhase);
    }

    get allCombatants() {
        // Getter for all combatants regardless of phase (useful for other operations)
        if (!this.combat) return [];
        return Array.from(this.combat.combatants.contents.sort(this.combat._sortCombatants));
    }

    get autoFit() {
        return game.settings.get(MODULE_ID, "overflowStyle") == "autofit";
    }

    // Phase Management Methods
    get currentPhase() {
        return this.combat?.getFlag(MODULE_ID, "currentPhase") || PHASES.FAST;
    }

    get currentRound() {
        return this.combat?.round || 1;
    }

    async setPhase(phase) {
        if (!this.combat) return;
        console.log("setPhase called with phase:", phase);
        await this.combat.setFlag(MODULE_ID, "currentPhase", phase);
        console.log("Phase flag set, triggering full re-render for all clients");
        
        // Trigger a full re-render for all clients to see the phase change
        this.render(true);
    }

    updatePhaseDisplay() {
        // Update just the phase display without re-rendering the entire application
        const phaseTitle = this.element[0]?.querySelector('.phase-title');
        const roundDisplay = this.element[0]?.querySelector('.round-display');
        
        if (phaseTitle) {
            phaseTitle.textContent = this.getPhaseDisplayName(this.currentPhase);
        }
        if (roundDisplay) {
            roundDisplay.textContent = `Round ${this.currentRound}`;
        }
        
        // Only refresh combatants if combat has started
        const combatStarted = this.combat?.getFlag(MODULE_ID, "combatStarted") ?? false;
        if (combatStarted) {
            this.setupCombatants();
        }
        
        console.log("Phase display updated to:", this.getPhaseDisplayName(this.currentPhase), "Round", this.currentRound);
        console.log("Combatants in current phase:", this.sortedCombatants.length);
    }

    async nextPhase() {
        console.log("nextPhase called, current phase:", this.currentPhase);
        const currentPhaseIndex = PHASE_ORDER.indexOf(this.currentPhase);
        const nextPhaseIndex = (currentPhaseIndex + 1) % PHASE_ORDER.length;
        console.log("Moving from phase index", currentPhaseIndex, "to", nextPhaseIndex);
        
        // If we're going from SLOW back to FAST, this means end of round - re-prompt players
        if (this.currentPhase === PHASES.SLOW && PHASE_ORDER[nextPhaseIndex] === PHASES.FAST) {
            console.log("=== END OF ROUND - RE-PROMPTING PLAYERS ===");
            
            if (!game.user.isGM) {
                console.log("Only GM can advance rounds");
                return;
            }
            
            // Set UI state to selecting to show phase selection interface
            await this.combat.setFlag(MODULE_ID, "uiState", "selecting");
            console.log("UI state set to selecting - showing phase selection interface");
            
            // Refresh UI to show "waiting for players" message
            this.render(true);
            
            // Re-prompt all player characters directly
            await this.repromptPlayersForNewRound();
            
            // Don't advance the round yet - wait for all players to select
            console.log("Waiting for all players to select phases before advancing round");
            return;
        }
        
        // Normal phase advancement (not end of round)
        await this.setPhase(PHASE_ORDER[nextPhaseIndex]);
    }

    // Direct re-prompting when advancing from SLOW to FAST
    async repromptPlayersForNewRound() {
        console.log("=== DIRECTLY RE-PROMPTING PLAYERS FOR NEW ROUND ===");
        
        if (!this.combat || !this.combat.combatants) {
            console.log("No valid combat found");
            return;
        }
        
        const playerCombatants = this.combat.combatants.filter(combatant => {
            return combatant.actor?.hasPlayerOwner;
        });
        
        console.log(`Found ${playerCombatants.length} player combatants to re-prompt`);
        
        // Clear existing phase selections and set needs selection flag
        for (const combatant of playerCombatants) {
            try {
                console.log(`Re-prompting for ${combatant.name}`);
                
                // Clear existing phases
                await combatant.unsetFlag(MODULE_ID, "phase");
                await combatant.unsetFlag(MODULE_ID, "playerSelectedPhase");
                
                // Set flag to trigger prompt
                await combatant.setFlag(MODULE_ID, "needsPhaseSelection", true);
                
                console.log(`Phase selection reset for ${combatant.name}`);
                
            } catch (error) {
                console.error(`Error resetting phase for ${combatant.name}:`, error);
            }
        }
        
        // Notify all players
        console.log("New round starting - all players should select their phase!");
        console.log("All players prompted for new round");
    }

    // Called when all players have selected their phases
    async finishRoundAdvancement() {
        console.log("=== ALL PLAYERS READY - FINISHING ROUND ADVANCEMENT ===");
        
        if (!game.user.isGM) {
            console.log("Not GM, skipping round advancement");
            return;
        }
        
        console.log("GM finishing round advancement...");
        
        // Ensure combat is marked as started and set UI state to active
        await this.combat.setFlag(MODULE_ID, "combatStarted", true);
        await this.combat.setFlag(MODULE_ID, "uiState", "active");
        console.log("Combat started flag set and UI state set to active");
        
        // Clear old flags that are no longer needed
        await this.combat.unsetFlag(MODULE_ID, "awaitingPhaseSelection");
        await this.combat.unsetFlag(MODULE_ID, "needsPhaseSelection");
        console.log("Old flags cleared - all clients should refresh");
        
        // Now advance to the next round
        await this.combat.nextRound();
        console.log("Round advanced to:", this.combat.round);
        
        // Set the phase to FAST (start of new round)
        await this.setPhase(PHASES.FAST);
        console.log("Phase set to FAST");
        
        // Refresh the combat tracker to show with new phases
        this.render(true);
        
        console.log("Round advancement completed - combat tracker restored");
    }

    async previousPhase() {
        const currentPhaseIndex = PHASE_ORDER.indexOf(this.currentPhase);
        const prevPhaseIndex = currentPhaseIndex === 0 ? PHASE_ORDER.length - 1 : currentPhaseIndex - 1;
        
        // If we're going from FAST back to SLOW, decrement the round
        if (this.currentPhase === PHASES.FAST && PHASE_ORDER[prevPhaseIndex] === PHASES.SLOW) {
            await this.combat.previousRound();
        }
        
        await this.setPhase(PHASE_ORDER[prevPhaseIndex]);
    }

    getCombatantPhase(combatant) {
        // Check if combatant already has a phase flag set
        const existingPhase = combatant.getFlag(MODULE_ID, "phase");
        if (existingPhase) return existingPhase;
        
        // Fallback: assign phase based on token disposition
        const disposition = combatant.token?.disposition;
        if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) {
            return PHASES.ENEMY;
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) {
            return PHASES.FAST;
        } else if (disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL) {
            return PHASES.SLOW;
        }
        
        // Ultimate fallback if no disposition is set
        return PHASES.FAST;
    }

    async setCombatantPhase(combatant, phase) {
        await combatant.setFlag(MODULE_ID, "phase", phase);
        // Refresh display if the phase change affects the current view
        this.updatePhaseDisplay();
        console.log(`${combatant.name} moved to ${phase} phase`);
    }

    // Helper method for testing - assign specific combatants to different phases
    async testPhaseAssignment() {
        const allCombatants = this.allCombatants;
        if (allCombatants.length >= 3) {
            await this.setCombatantPhase(allCombatants[0], PHASES.FAST);
            await this.setCombatantPhase(allCombatants[1], PHASES.ENEMY);
            await this.setCombatantPhase(allCombatants[2], PHASES.SLOW);
            console.log("Test phase assignment complete - first combatant in Fast, second in Enemy, third in Slow");
        } else {
            console.log("Need at least 3 combatants for test phase assignment");
        }
    }

    getPhaseDisplayName(phase) {
        const phaseNames = {
            [PHASES.FAST]: "Fast Phase",
            [PHASES.ENEMY]: "Enemy Phase", 
            [PHASES.SLOW]: "Slow Phase"
        };
        return phaseNames[phase] || "Unknown Phase";
    }

    setHooks() {
        this.hooks = [
            {
                hook: "renderCombatTracker",
                fn: this._onRenderCombatTracker.bind(this),
            },
            {
                hook: "createCombatant",
                fn: this.setupCombatants.bind(this),
            },
            {
                hook: "deleteCombatant",
                fn: this.setupCombatants.bind(this),
            },
            {
                hook: "updateCombatant",
                fn: this.updateCombatant.bind(this),
            },
            {
                hook: "updateCombat",
                fn: this._onCombatTurn.bind(this),
            },
            {
                hook: "deleteCombat",
                fn: this._onDeleteCombat.bind(this),
            },
            {
                hook: "combatStart",
                fn: this._onCombatStart.bind(this),
            },
            {
                hook: "hoverToken",
                fn: this._onHoverToken.bind(this),
            },
        ];
        for (let hook of this.hooks) {
            hook.id = Hooks.on(hook.hook, hook.fn);
        }
    }

    removeHooks() {
        for (let hook of this.hooks) {
            Hooks.off(hook.hook, hook.id);
        }
    }

    getData() {
        const scroll = game.settings.get(MODULE_ID, "overflowStyle") === "scroll";
        const hasCombat = !!this.combat;
        
        // Simplified: Use a single UI state flag instead of multiple complex flags
        const uiState = this.combat?.getFlag(MODULE_ID, "uiState") ?? "preparation";
        // Possible states: "preparation", "selecting", "active"
        
        const pendingPlayers = this.getPendingPlayers();
        
        console.log("=== TRACKER getData() ===");
        console.log("User:", game.user.name, "IsGM:", game.user.isGM);
        console.log("hasCombat:", hasCombat);
        console.log("uiState:", uiState);
        console.log("pendingPlayers:", pendingPlayers);
        
        const data = {
            isGM: game.user.isGM,
            scroll,
            hasCombat,
            uiState,
            pendingPlayers,
            currentPhase: this.currentPhase,
            phaseDisplayName: this.getPhaseDisplayName(this.currentPhase),
            currentRound: this.currentRound,
        };
        
        console.log("Template data:", data);
        return data;
    }

    async beginCombat() {
        if (!game.user.isGM) return;
        
        const pendingPlayers = this.getPendingPlayers();
        
        if (pendingPlayers.length > 0) {
            const playerList = pendingPlayers.join(", ");
            const message = pendingPlayers.length === 1 
                ? `${playerList} is still choosing their phase.`
                : `${playerList} are still choosing their phases.`;
            
            ui.notifications.warn(message);
            return;
        }

        // All players have selected phases, start combat
        await this.combat.setFlag(MODULE_ID, "combatStarted", true);
        await this.combat.setFlag(MODULE_ID, "uiState", "active");
        console.log("Combat started! All phases selected. UI state set to active.");
        
        // Re-render to show the combat tracker
        this.render(true);
        
        // Start the actual combat
        if (!this.combat.started) {
            this.combat.startCombat();
        }
    }

    async createEncounter() {
        if (!game.user.isGM) return;
        
        try {
            // Create a new combat encounter
            const combat = await Combat.create({
                scene: canvas.scene?.id,
                active: true
            });
            
            console.log("Created new encounter:", combat.id);
            
            // Update this dock to use the new combat
            this.combat = combat;
            
            // Re-render to show the new encounter state
            this.render(true);
            
        } catch (error) {
            console.error("Error creating encounter:", error);
            ui.notifications.error("Failed to create encounter");
        }
    }

    async cancelEncounter() {
        if (!game.user.isGM) return;
        
        try {
            // Confirm with the user before canceling
            const confirmed = await Dialog.confirm({
                title: "Cancel Encounter",
                content: "<p>Are you sure you want to cancel this encounter? All combatants and phase selections will be lost.</p>",
                yes: () => true,
                no: () => false
            });
            
            if (!confirmed) return;
            
            if (this.combat) {
                console.log("Canceling encounter:", this.combat.id);
                await this.combat.delete();
                ui.notifications.info("Encounter canceled");
            }
            
            // Clear the combat reference
            this.combat = null;
            
            // Re-render to show the no-combat state
            this.render(true);
            
        } catch (error) {
            console.error("Error canceling encounter:", error);
            ui.notifications.error("Failed to cancel encounter");
        }
    }

    getPendingPlayers() {
        if (!this.combat) return [];
        
        console.log("Checking pending players...");
        this.combat.combatants.forEach(c => {
            if (c.actor?.hasPlayerOwner) {
                const phase = c.getFlag(MODULE_ID, "phase");
                const playerSelected = c.getFlag(MODULE_ID, "playerSelectedPhase");
                console.log(`- ${c.name}: phase=${phase}, playerSelected=${playerSelected}, hasPlayerOwner=${c.actor?.hasPlayerOwner}`);
            }
        });
        
        const playerCombatants = this.combat.combatants.filter(c => 
            c.actor?.hasPlayerOwner && !c.getFlag(MODULE_ID, "playerSelectedPhase")
        );
        
        console.log(`Found ${playerCombatants.length} combatants without playerSelectedPhase flag`);
        
        // Get unique player names
        const pendingPlayerNames = [...new Set(
            playerCombatants.map(c => {
                // Find the first player who owns this actor
                const ownerIds = Object.entries(c.actor.ownership)
                    .filter(([id, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
                    .map(([id]) => id);
                
                const ownerUser = game.users.find(u => ownerIds.includes(u.id) && !u.isGM);
                console.log(`- Pending: ${c.name} owned by ${ownerUser?.name}`);
                return ownerUser?.name;
            }).filter(Boolean)
        )];
        
        console.log("Pending players:", pendingPlayerNames);
        return pendingPlayerNames;
    }

    setupCombatants() {
        // Only set up combatants if combat has started and the combatants container exists
        const combatStarted = this.combat?.getFlag(MODULE_ID, "combatStarted") ?? false;
        const combatantsContainer = this.element[0]?.querySelector("#combatants");
        
        if (!combatStarted || !combatantsContainer) {
            console.log("Combat not started or combatants container not found, skipping setup");
            return;
        }
        
        this.portraits = [];
        this.sortedCombatants.forEach((combatant) => this.portraits.push(new CONFIG.combatTrackerDock.CombatantPortrait(combatant)));
        combatantsContainer.innerHTML = "";
        this.portraits.forEach((p) => combatantsContainer.appendChild(p.element));
        const isEven = this.portraits.length % 2 === 0;
        this.element[0].classList.toggle("even", isEven);
        this.updateOrder();
        this.autosize();
        if (!this._combatTrackerRefreshed) {
            this._combatTrackerRefreshed = true;
            ui.combat.render(true);
        }
        if (this._playAnimation && this.sortedCombatants.length > 0) {
            this._playAnimation = false;
            const promises = this.portraits.map((p) => p.ready);
            this._promises = promises;
            Promise.all(promises).then(() => {
                this.playIntroAnimation();
            });
        }
    }

    playIntroAnimation() {
        Hooks.callAll("combatDock:playIntroAnimation", this);

        // Simple fade-in animation for portraits
        Array.from(this.element[0].querySelector("#combatants").children).forEach((el, index) => {
            el.style.opacity = "0";
            setTimeout(() => {
                el.style.transition = "opacity 0.3s ease-in-out";
                el.style.opacity = "1";
            }, index * 50);
        });

        setTimeout(() => {
            this.element[0].classList.remove("hidden");
            this.centerCurrentCombatant();
        }, 100);
    }

    autosize() {
        const max = parseInt(game.settings.get(MODULE_ID, "portraitSize"));
        const aspect = game.settings.get(MODULE_ID, "portraitAspect");
        this._currentPortraitSize = {
            max: max,
            aspect: aspect,
        };
        
        if (!this.autoFit) {
            return document.documentElement.style.setProperty("--combatant-portrait-size", max + "px");
        }
        
        // For horizontal layout, auto-size based on available width
        const maxSpace = document.getElementById("ui-top").getBoundingClientRect().width * 0.9;
        const combatantCount = this.sortedCombatants.length;
        
        // Avoid division by zero when no combatants
        const portraitSize = combatantCount > 0 ? Math.min(max, Math.floor(maxSpace / combatantCount)) : max;
        
        document.documentElement.style.setProperty("--combatant-portrait-size", portraitSize / 1.2 + "px");
    }

    updateCombatant(combatant, updates = {}) {
        const portrait = this.portraits.find((p) => p.combatant === combatant);
        if (portrait) portrait.renderInner();
    }

    updateCombatants() {
        this.portraits.forEach((p) => p.renderInner());
    }

    updateOrder() {
        const combatants = this.sortedCombatants;
        
        // Simple order based on default combat order
        this.portraits.forEach((p) => {
            const order = combatants.indexOf(p.combatant);
            p.element.style.setProperty("order", order);
        });
    }

    updateStartEndButtons() {
        if(!this.element[0]) return;
        
        const startButton = this.element[0].querySelector(`[data-action="start-combat"]`);
        const endButton = this.element[0].querySelector(`[data-action="end-combat"]`);
        
        // Only update if buttons exist (they don't exist in pre-combat state)
        if (startButton) {
            startButton.style.display = this.combat.started ? "none" : "";
        }
        if (endButton) {
            endButton.style.display = this.combat.started ? "" : "none";
        }
    }

    appendHtml(){
        return document.querySelector("#ui-top").prepend(this.element[0]);
    }

    activateListeners(html) {
        if (this._closed) return this.close();
        super.activateListeners(html);
        
        // Only set up combatants if combat has started
        this.setupCombatants();
        
        this.appendHtml();
        
        // Always remove hidden class to make dock visible
        setTimeout(() => {
            this.element[0].classList.remove("hidden");
        }, 100);
        
        // Ensure phase display is properly initialized
        this.updatePhaseDisplay();
        this.element[0].querySelectorAll(".buttons-container i, .begin-combat-btn, .create-encounter-btn, .cancel-encounter-btn").forEach((element) => {
            element.addEventListener("click", async (e) => {
                const action = e.currentTarget.dataset.action;
                switch (action) {
                    case "previous-phase":
                        this.previousPhase();
                        break;
                    case "next-phase":
                        this.nextPhase();
                        break;
                    case "previous-round":
                        this.combat.previousRound();
                        break;
                    case "next-round":
                        this.combat.nextRound();
                        break;
                    case "end-combat":
                        this.combat.endCombat();
                        break;
                    case "configure":
                        new CombatTrackerConfig().render(true);
                        break;
                    case "start-combat":
                        this.combat.startCombat();
                        break;
                    case "begin-combat":
                        await this.beginCombat();
                        break;
                    case "add-event":
                        new AddEvent(this.combat).render(true);
                        break;
                    case "create-encounter":
                        await this.createEncounter();
                        break;
                    case "cancel-encounter":
                        await this.cancelEncounter();
                        break;
                }
            });
        });
        this.autosize();
        // Only call setControlsOrder if the element is properly rendered
        if (this.element && this.element[0]) {
            this.setControlsOrder();
        }
    }

    _onRenderCombatTracker() {
        this.portraits.forEach((p) => p.renderInner());
        this.updateStartEndButtons();
    }

    _onCombatTurn(combat, updates, update) {
        if (!("turn" in updates) && !("round" in updates)) return;
        if ("round" in updates) this._onRoundChange();
        
        if (!this.element || !this.element[0]) return;
        
        const combatantsContainer = this.element[0].querySelector("#combatants");
        if (!combatantsContainer) return;
        
        const filteredChildren = Array.from(combatantsContainer.children).filter((c) => !c.classList.contains("separator"));
        const currentSize = combatantsContainer.getBoundingClientRect();
        combatantsContainer.style.minWidth = currentSize.width + "px";
        combatantsContainer.style.minHeight = currentSize.height + "px";
        //find combatant with lowest order

        const childrenByHighestOrder = [...filteredChildren].sort((a, b) => b.style.order - a.style.order);
        const childrenByLowestOrder = [...filteredChildren].sort((a, b) => a.style.order - b.style.order);

        const currentCombatant = this.combat.combatant;
        const currentIndex = this.sortedCombatants.findIndex((c) => c === currentCombatant);
        let nextDefeatedCount = 0;
        let previousDefeatedCount = 0;
        const sortedCombatants = this.sortedCombatants;
        for (let i = 0 + 1; i < sortedCombatants.length; i++) {
            const index = (currentIndex + i) % sortedCombatants.length;
            const combatant = sortedCombatants[index];
            if (combatant.defeated) previousDefeatedCount++;
            else break;
        }

        for (let i = 0 + 1; i < sortedCombatants.length; i++) {
            const index = (currentIndex - i + sortedCombatants.length) % sortedCombatants.length;
            const combatant = sortedCombatants[index];
            if (combatant.defeated) nextDefeatedCount++;
            else break;
        }

        const nextDefeatedCombatants = childrenByLowestOrder.slice(0, nextDefeatedCount + 1);
        const previousDefeatedCombatants = childrenByHighestOrder.slice(0, previousDefeatedCount + 1);

        const first = nextDefeatedCount != 0 ? nextDefeatedCombatants : [[...filteredChildren].reduce((a, b) => (a.style.order < b.style.order ? a : b), combatantsContainer.children[0])];
        const last = previousDefeatedCount != 0 ? previousDefeatedCombatants : [[...filteredChildren].reduce((a, b) => (a.style.order > b.style.order ? a : b), combatantsContainer.children[0])];

        const els = update.direction === 1 ? first : last;

        if (this._playAnimation && this.sortedCombatants.length > 0) {
            this._playAnimation = false;
            this.updateOrder();
            this.playIntroAnimation();
            return;
        }

        setTimeout(() => this.updateOrder(), 200);

        if (!this.trueCarousel) {
            combatantsContainer.style.minWidth = "";
            combatantsContainer.style.minHeight = "";
            return this.centerCurrentCombatant();
        }

        for (const el of els) {
            el.classList.add(`collapsed-${this.isVertical ? "vertical" : "horizontal"}`);
            setTimeout(() => {
                el.classList.remove(`collapsed-${this.isVertical ? "vertical" : "horizontal"}`);
                setTimeout(() => {
                    combatantsContainer.style.minWidth = "";
                    combatantsContainer.style.minHeight = "";
                }, 200);
                this.centerCurrentCombatant();
            }, 200);
        }
    }

    async _onRoundChange() {
        // Only GM should handle round changes and combatant updates
        if (!game.user.isGM) {
            console.log("Round change detected by player, but only GM processes updates");
            return;
        }
        
        const toDelete = [];
        const toClearActions = [];
        
        for (const combatant of this.combat.combatants) {
            // Clear action taken flags for all combatants at start of new round
            if (combatant.getFlag(MODULE_ID, "actionTaken")) {
                toClearActions.push(combatant.id);
            }
            
            const duration = combatant.getFlag(MODULE_ID, "duration");
            if (!duration) continue;
            const roundCreated = combatant.getFlag(MODULE_ID, "roundCreated");
            if (!roundCreated) continue;
            const currentRound = this.combat.round;
            const roundsElapsed = currentRound - roundCreated;
            if (roundsElapsed >= duration) {
                toDelete.push(combatant.id);
                ChatMessage.create({
                    speaker: { alias: "Combat Tracker Dock" },
                    content: game.i18n.localize("tides-of-battle.add-event.expired").replace("%n", `<strong>${combatant.name}</strong>`),
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    whisper: [game.user.id],
                });
            }
        }
        
        // Clear action taken flags
        if (toClearActions.length > 0) {
            const updates = toClearActions.map(id => ({
                _id: id,
                [`flags.${MODULE_ID}.-=actionTaken`]: null
            }));
            await this.combat.updateEmbeddedDocuments("Combatant", updates);
        }
        
        if (toDelete.length > 0) {
            await this.combat.deleteEmbeddedDocuments("Combatant", toDelete);
        }
    }

    centerCurrentCombatant() {
        const current = this.portraits.find((p) => p.combatant === this.combat.combatants.get(this.combat?.current?.combatantId));
        if (!current) return;
        const el = current.element;
        el.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
        });
    }

    setControlsOrder() {
        // Simple horizontal layout - no special ordering needed
        if (!this.element || !this.element[0]) return;
        
        const uiLeft = this.element[0].querySelector(".buttons-container.left");
        const uiRight = this.element[0].querySelector(".buttons-container.right");
        const combatants = this.element[0].querySelector("#combatants");
        
        if (uiLeft) {
            uiLeft.style.order = "";
            uiLeft.style.marginRight = "";
        }
        if (uiRight) {
            uiRight.style.order = "";
            uiRight.style.marginLeft = "";
        }
        if (combatants) {
            combatants.style.order = "";
        }
    }

    _onDeleteCombat(combat) {
        if (combat === this.combat) {
            this.close();
        }
    }

    _onCombatStart(combat) {
        if (combat === this.combat) this._playAnimation = true;
    }

    _onHoverToken(token, hover) {
        const portrait = this.portraits.find((p) => p.token === token);
        if (!portrait) return;
        portrait.element.classList.toggle("hovered", hover);
    }

    refresh() {
        this.updateCombatants();
        this.appendHtml();
    }

    async close(...args) {
        this.removeHooks();
        window.removeEventListener("resize", this.autosize.bind(this));
        if (this.element[0]) this.element[0].remove();
        this._closed = true;
        return super.close(...args);
    }
}
