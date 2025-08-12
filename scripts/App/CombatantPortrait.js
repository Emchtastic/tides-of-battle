import { MODULE_ID } from "../main.js";
import { generateDescription, getSystemIcons } from "../systems.js";

export class CombatantPortrait {
    constructor(combatant) {
        this.combatant = combatant;
        this.combat = combatant.combat;
        this.element = document.createElement("div");
        this.element.classList.add("combatant-portrait");
        this.element.setAttribute("data-combatant-id", combatant.id);
        this.element.setAttribute("data-tooltip-class", "combat-dock-tooltip");
        this.element.style.backgroundImage = `url("${game.settings.get(MODULE_ID, "portraitImageBackground")}")`;
        this.resolve = null;
        this.ready = new Promise((res) => (this.resolve = res));
        this._hasTakenTurn = this.combat.round ?? 0 <= 1;
        if (!game.settings.get(MODULE_ID, "hideFirstRound")) this._hasTakenTurn = true;
        this.activateCoreListeners();
        this.renderInner();
    }

    get actor() {
        return this.combatant?.actor;
    }

    get token() {
        return this.combatant?.token?.object;
    }

    get img() {
        const useActor = game.settings.get(MODULE_ID, "portraitImage") === "actor";
        return (useActor ? this.combatant.actor?.img : this.combatant.img) ?? this.combatant.img;
    }

    get name() {
        if (this.combatant.isOwner) return this.combatant.name;
        const displayName = game.settings.get(MODULE_ID, "displayName");
        if (displayName === "owner") return this.combatant.isOwner ? this.combatant.name : "???";
        if (displayName === "default") return this.combatant.name;
        return [CONST.TOKEN_DISPLAY_MODES.HOVER, CONST.TOKEN_DISPLAY_MODES.ALWAYS].includes(this.token?.document?.displayName) ? this.combatant.name : "???";
    }

    get firstTurnHidden() {
        const combatant = this.combatant;
        const hasPermission = (combatant.actor?.permission ?? -10) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER || combatant.isOwner;
        const isFriendly = combatant.token?.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
        if (!hasPermission && !this._hasTakenTurn && !isFriendly) return true;
        return false;
    }

    get isEvent() {
        return this.combatant.flags[MODULE_ID]?.event ?? false;
    }

    get eventResource() {
        if (!this.isEvent) return null;
        const flags = this.combatant.flags[MODULE_ID];
        const {duration, roundCreated} = flags;
        const currentRound = this.combat.round;
        return {
            max: duration,
            value: duration - (currentRound - roundCreated),
            percentage: Math.round((duration - (currentRound - roundCreated)) / duration * 100),
        };
    }

    get eventRoundsLeft() {
        return this.combatant.getFlag(MODULE_ID, "roundsLeft") ?? 0;
    }

    activateCoreListeners() {
        this.element.addEventListener("mouseenter", this._onHoverIn.bind(this));
        this.element.addEventListener("mouseleave", this._onHoverOut.bind(this));
    }
    activateListeners() {
        this.element.querySelector(".combatant-wrapper").addEventListener("mousedown", this._onCombatantMouseDown.bind(this));

        (this.element.querySelectorAll(".system-icon") ?? []).forEach((iconEl, index) => {
            const systemIcons = this._systemIcons;
            const icon = systemIcons[index];
            if (icon.callback && icon.enabled) {
                iconEl.addEventListener("click", async (event) => {
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    icon.callback(event, this.combatant, index, icon.id);
                });
            }
        });

        if(!this.actor?.isOwner) return;

        (this.element.querySelectorAll(".portrait-effect") ?? []).forEach((effectEl) => {
            //delete on right click
            effectEl.addEventListener("contextmenu", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const uuid = effectEl.dataset.uuid;
                const effect = await fromUuid(uuid);
                const statusEffect = CONFIG.statusEffects.find((s) => s.img === effect.img);

                const response = await Dialog.confirm({
                    title: game.i18n.localize(`${MODULE_ID}.deleteEffectTitle`),
                    content: game.i18n.localize(`${MODULE_ID}.deleteEffectContent`) + game.i18n.localize(effect?.label ?? statusEffect?.name ?? "") + "?",
                    yes: () => true,
                    no: () => false,
                    defaultYes: false,
                    close: () => false,
                });
                if(!response) return;
                if (!effect) {
                    this.token?.toggleEffect(uuid);
                    return;
                }
                await effect.delete();
            });
        });
    }

    async _onCombatantMouseDown(event) {
        event.preventDefault();

        if (event.target.dataset.action === "player-pass") return this.combat.nextTurn();

        if (!event.target.classList.contains("combatant-wrapper")) return;

        if (event.button === 2) return game.user.isGM && this.combatant.sheet.render(true);

        const combatant = this.combatant;
        const token = combatant.token;
        if (!combatant.actor?.testUserPermission(game.user, "OBSERVER")) return;
        const now = Date.now();

        // Handle double-left click to open sheet
        const dt = now - this._clickTime;
        this._clickTime = now;
        if (dt <= 250) {
            return combatant.actor?.sheet.render(true);
        }

        // Control and pan to Token object
        if (token?.object) {
            token.object?.control({ releaseOthers: true });
            return canvas.animatePan(token.object.center);
        }
    }

    _onHoverIn(event) {
        if (!this.token) return;
        if ( this.token?.isVisible && !this.token.controlled ) this.token._onHoverIn(event);
    }

    _onHoverOut(event) {
        if (!this.token) return;
        if (this.token.hover) this.token._onHoverOut(event);
    }

    async renderInner() {
        const data = await this.getData();
        this.element.classList.toggle("hidden", !data);
        if (!data) {
            this.resolve(true);
            this.element.innerHTML = "";
            return;
        }
        const template = await foundry.applications.handlebars.renderTemplate("modules/tides-of-battle/templates/combatant-portrait.hbs", { ...data });
        const tooltip = await foundry.applications.handlebars.renderTemplate("modules/tides-of-battle/templates/combatant-tooltip.hbs", { ...data });
        this.element.innerHTML = template;
        this.element.setAttribute("data-tooltip", tooltip);
        
        // Set tooltip direction based on alignment (simplified - no carousel)
        const alignment = game.settings.get(MODULE_ID, "alignment");
        this.element.setAttribute("data-tooltip-direction", alignment == "left" ? TooltipManager.TOOLTIP_DIRECTIONS.RIGHT : TooltipManager.TOOLTIP_DIRECTIONS.LEFT);

        this.element.classList.toggle("active", data.css.includes("active"));
        this.element.classList.toggle("visible", data.css.includes("hidden"));
        this.element.classList.toggle("defeated", data.css.includes("defeated"));
        this.element.classList.toggle("action-taken", data.css.includes("action-taken"));
        this.element.style.borderBottomColor = this.getBorderColor(this.token?.document);
        
        // Remove existing event listeners to prevent duplicates
        if (this._actionClickHandler) {
            this.element.removeEventListener("click", this._actionClickHandler);
        }
        if (this._contextMenuHandler) {
            this.element.removeEventListener("contextmenu", this._contextMenuHandler);
        }
        
        // Add GM-only event handlers for action tracking and active combatant selection
        if (game.user.isGM) {
            // Left click for action tracking (gray out)
            this._actionClickHandler = async (event) => {
                // Don't trigger on action button clicks
                if (event.target.classList.contains("action") || event.target.closest(".action")) return;
                
                event.stopPropagation();
                console.log("Portrait clicked for combatant:", this.combatant.name);
                const currentFlag = this.combatant.getFlag(MODULE_ID, "actionTaken") || false;
                console.log("Current action flag:", currentFlag, "Setting to:", !currentFlag);
                await this.combatant.setFlag(MODULE_ID, "actionTaken", !currentFlag);
            };
            
            // Right click for active combatant selection
            this._contextMenuHandler = async (event) => {
                // Don't trigger on action button clicks
                if (event.target.classList.contains("action") || event.target.closest(".action")) return;
                
                event.preventDefault();
                event.stopPropagation();
                console.log("Right-click detected - setting as active combatant:", this.combatant.name);
                await this.setAsActiveCombatant();
            };
            
            this.element.addEventListener("click", this._actionClickHandler);
            this.element.addEventListener("contextmenu", this._contextMenuHandler);
        }
        
        this.element.querySelectorAll(".action").forEach((action) => {
            action.addEventListener("click", async (event) => {
                event.stopPropagation();
                event.stopImmediatePropagation();
                const dataAction = action.dataset.action;
                switch (dataAction) {
                    case "toggle-hidden":
                        await this.combatant.update({ hidden: !this.combatant.hidden });
                        break;
                    case "toggle-defeated":
                        await ui.combat._onToggleDefeatedStatus(this.combatant);
                        break;
                    case "ping":
                        await ui.combat._onPingCombatant(this.combatant);
                        break;
                }
            });
        });
        const ib = this.element.querySelector(".image-border");
        if(ib) ib.style.backgroundImage = `url("${game.settings.get(MODULE_ID, "portraitImageBorder")}")`;
        this.activateListeners();
        this.resolve(true);
    }

    getResource(resource = null, primary = false) {

        if (this.isEvent && primary) return this.eventResource;

        if (!this.actor || !this.combat) return null;

        resource = resource ?? this.combat.settings.resource;

        let max, value, percentage;

        if (!resource) return { max, value, percentage };

        max = foundry.utils.getProperty(this.actor.system, resource + ".max") ?? foundry.utils.getProperty(this.actor.system, resource.replace("value", "") + "max");

        value = foundry.utils.getProperty(this.actor.system, resource) ?? foundry.utils.getProperty(this.actor.system, resource + ".value");

        if (max !== undefined && value !== undefined && Number.isNumeric(max) && Number.isNumeric(value)) percentage = Math.min(Math.max( Math.round((value / max) * 100) , 0) , 100);

        value = this.validateValue(value);
        max = this.validateValue(max);

        return { max, value, percentage };
    }

    async setAsActiveCombatant() {
        console.log("Right-click detected - setting as active combatant:", this.combatant.name);
        
        // Clear any existing active combatant in this combat
        const currentActive = this.combat.getFlag(MODULE_ID, "activeCombatant");
        if (currentActive) {
            console.log("Clearing previous active combatant");
            // Clear the turn indicator from the previous token
            const previousCombatant = this.combat.combatants.get(currentActive);
            if (previousCombatant?.token?.object) {
                this.clearTurnIndicator(previousCombatant.token.object);
            }
        }
        
        // Set this combatant as the active one
        await this.combat.setFlag(MODULE_ID, "activeCombatant", this.combatant.id);
        
        // Add Foundry's native turn indicator to the token
        const tokenObject = this.combatant.token?.object;
        console.log("Attempting to add turn indicator to token object:", tokenObject);
        
        if (tokenObject) {
            this.addTurnIndicator(tokenObject);
        } else {
            console.warn("No token object found for combatant:", this.combatant.name);
            // Try alternative method to find token
            const foundToken = canvas.tokens.placeables.find(t => t.document.id === this.combatant.token?.id);
            console.log("Alternative token search result:", foundToken);
            if (foundToken) {
                this.addTurnIndicator(foundToken);
            }
        }
        
        // Refresh all portraits to update visual states
        if (ui.combatDock) {
            ui.combatDock.setupCombatants();
        }
        
        // Visual feedback
        ui.notifications.info(`${this.combatant.name} is now acting`);
    }

    addTurnIndicator(tokenObject) {
        console.log("addTurnIndicator called with:", tokenObject);
        
        try {
            // Use Foundry's native turn indicator system
            if (typeof tokenObject.drawTurnIndicator === 'function') {
                tokenObject.drawTurnIndicator();
                console.log("Added native turn indicator to", this.combatant.name);
            } else {
                // Fallback to manual turn indicator creation using Foundry's approach
                this.drawCustomTurnIndicator(tokenObject);
            }
        } catch (error) {
            console.error("Error creating turn indicator:", error);
        }
    }

    drawCustomTurnIndicator(tokenObject) {
        // Remove any existing indicators first
        this.clearTurnIndicator(tokenObject);
        
        // Create turn indicator using Foundry's style
        const indicator = new PIXI.Container();
        indicator.name = "turnIndicator";
        
        // Create the spinning die background
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.8);
        bg.drawCircle(0, 0, tokenObject.w * 0.2);
        bg.endFill();
        indicator.addChild(bg);
        
        // Create the die icon
        const icon = new PIXI.Text("🎲", {
            fontSize: tokenObject.w * 0.25,
            fill: 0xffffff,
            anchor: 0.5
        });
        icon.anchor.set(0.5);
        indicator.addChild(icon);
        
        // Position the indicator
        indicator.x = tokenObject.w / 2;
        indicator.y = tokenObject.h * 0.1; // Top of token
        indicator.zIndex = 1000; // Above token
        
        // Add to token
        tokenObject.addChild(indicator);
        
        // Create rotation animation
        const ticker = (delta) => {
            if (indicator.parent) {
                icon.rotation += 0.1 * delta;
            } else {
                canvas.app.ticker.remove(ticker);
            }
        };
        
        canvas.app.ticker.add(ticker);
        console.log("Added custom turn indicator to", this.combatant.name);
    }

    clearTurnIndicator(tokenObject) {
        console.log("clearTurnIndicator called with:", tokenObject);
        
        try {
            // Use Foundry's native method if available
            if (typeof tokenObject.clearTurnIndicator === 'function') {
                tokenObject.clearTurnIndicator();
                console.log("Cleared native turn indicator");
            } else {
                // Manual cleanup
                const existingIndicator = tokenObject.children.find(child => 
                    child.name === "turnIndicator" || child.name === "activeIndicator"
                );
                if (existingIndicator) {
                    tokenObject.removeChild(existingIndicator);
                    console.log("Removed custom turn indicator");
                }
            }
        } catch (error) {
            console.error("Error clearing turn indicator:", error);
        }
    }

    get isActiveCombatant() {
        const activeCombatantId = this.combat?.getFlag(MODULE_ID, "activeCombatant");
        return activeCombatantId === this.combatant.id;
    }

    validateValue(value) {
        if (typeof value === "boolean") value = value ? "✓" : "✗";

        if (Array.isArray(value)) value = value.join(", ");

        if (value === "") value = null;

        if (!Number.isNumeric(value) && Object.prototype.toString.call(value) != "[object String]") value = null;

        return value;
    }

    getBarsOrder(hasEffects, r1, r2) {
        const sett = game.settings.get(MODULE_ID, "barsPlacement");
        r1 = !isNaN(r1?.percentage) ? 0 : 1;
        r2 = !isNaN(r2?.percentage) ? 0 : 1;

        switch (sett) {
            case "left":
                return {bar1: 0, bar2: 1, init: 2, effects: 3, bar1ML: 0, bar2ML: 0, initBars: 2.5 - r1 - r2};
            case "right": 
                return {bar1: 2, bar2: 3, init: 0, effects: 1, bar1ML: hasEffects ? 0 : "auto", bar2ML: 0, initBars: 0.5};
            case "twinned":
                return {bar1: 0, bar2: 3, init: 1, effects: 2, bar1ML: 0, bar2ML: hasEffects ? 0 : "auto", initBars: 1.5 - r1};
        }
    }

    get hasPermission() {
        const combatant = this.combatant;
        const playerPlayerPermission = combatant.actor?.hasPlayerOwner && game.settings.get(MODULE_ID, "playerPlayerPermission");
        const hasPermission = (combatant.actor?.permission ?? -10) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER || combatant.isOwner || playerPlayerPermission;
        return hasPermission;
    }

    async getData() {
        // Format information about each combatant in the encounter
        const combatant = this.combatant;
        const hideDefeated = game.settings.get(MODULE_ID, "hideDefeated");
        if (hideDefeated && combatant.isDefeated) return null;
        const isActive = this.combat.turns.indexOf(combatant) === this.combat.turn;
        if (isActive && this.combat.started) this._hasTakenTurn = true;
        const hasPermission = this.hasPermission;
        if (!hasPermission && !this._hasTakenTurn) return null;
        if (!combatant.visible && !game.user.isGM) return null;
        const trackedAttributes = game.settings
            .get(MODULE_ID, "attributes")
            .map((a) => {
                const resourceData = this.getResource(a.attr);
                const iconHasExtension = a.icon.includes(".");
                return {
                    ...resourceData,
                    icon: iconHasExtension ? `<img src="${a.icon}" />` : `<i class="${a.icon} icon"></i>`,
                    units: a.units || "",
                };
            })
            .filter((a) => a.value !== null && a.value !== undefined);

        const systemIcons = this.getSystemIcons();
        const systemIconCount = systemIcons.resource?.length ?? 0;

        const attributesVisibility = game.settings.get(MODULE_ID, "attributeVisibility");

        const displayDescriptionsSetting = game.settings.get(MODULE_ID, "displayDescriptions");

        let displayDescriptions = false;

        if (displayDescriptionsSetting === "all") displayDescriptions = true;
        else if (displayDescriptionsSetting === "owner") displayDescriptions = hasPermission;

        // Prepare turn data
        const resource = hasPermission ? this.getResource(null, true) : null;
        const resource2 = hasPermission ? this.getResource(game.settings.get(MODULE_ID, "resource")) : null;
        const portraitResourceSetting = game.settings.get(MODULE_ID, "portraitResource");
        const portraitResource = hasPermission && portraitResourceSetting ? this.getResource(portraitResourceSetting) : null;
        
        // Check if this combatant has taken their action this round
        const actionTaken = combatant.getFlag(MODULE_ID, "actionTaken") || false;
        
        const turn = {
            id: combatant.id,
            name: this.name,
            img: this.img,
            active: this.combat.turns.indexOf(combatant) === this.combat.turn,
            owner: combatant.isOwner,
            isGM: game.user.isGM,
            showPass: combatant.isOwner && !game.user.isGM,
            defeated: combatant.isDefeated,
            hidden: combatant.hidden,
            actionTaken: actionTaken,
            hasResource: resource !== null,
            hasResource2: resource2 !== null,
            hasPortraitResource: portraitResource !== null,
            hasPlayerOwner: combatant.actor?.hasPlayerOwner,
            hasPermission: hasPermission,
            resource: resource,
            resource2: resource2,
            portraitResource: portraitResource,
            showBars: attributesVisibility == "bars" || attributesVisibility == "both",
            showText: attributesVisibility == "text" || attributesVisibility == "both",
            canPing: combatant.sceneId === canvas.scene?.id && game.user.hasPermission("PING_CANVAS"),
            attributes: trackedAttributes,
            description: this.getDescription(),
            resSystemIcons: systemIcons.resource,
            tooltipSystemIcons: systemIcons.tooltip,
            systemIconsSizeMulti: clamp(0.03, 1/(systemIconCount * 2) ,0.1),
            barsOrder: null,
            displayDescriptions: displayDescriptions,
        };
        turn.css = [
            turn.active ? "active" : "", 
            turn.hidden ? "hidden" : "", 
            turn.defeated ? "defeated" : "", 
            turn.actionTaken ? "action-taken" : "",
            this.isActiveCombatant ? "active-combatant" : ""
        ].join(" ").trim();

        // Actor and Token status effects
        turn.effects = new Set();
        turn.hasAttributes = trackedAttributes.length > 0;
        if (combatant.actor) {
            for (const effect of combatant.actor.temporaryEffects) {
                if (effect.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) turn.defeated = true;
                else if (effect.img) {
                    const description = effect.description ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description) : "";
                    const duration = parseInt(effect.duration?.label ?? "");
                    const percent = effect.duration?.remaining / effect.duration?.duration;
                    const uuid = effect.uuid;
                    turn.effects.add({ uuid, img: effect.img, label: effect.name, description: description, duration: duration, percent: isNaN(percent) ? null : percent*100, hasDuration: !isNaN(duration) });
                }
            }
        }

        turn.hasEffects = turn.effects.size > 0;
        turn.barsOrder = this.getBarsOrder(turn.hasEffects, resource, resource2);
        return turn;
    }

    getDescription() {
        const actor = this.actor;
        if (!actor) return null;
        let description = null;

        try {
            description = generateDescription(actor);
        } catch (e) {
            console.error(e);
        }

        return description;
    }

    getSystemIcons() {
        try {
            const sett = game.settings.get(MODULE_ID, "showSystemIcons");
            const icons = sett > 0 ? getSystemIcons(this.combatant) : [];
            const hasPermission = this.hasPermission;
            icons.forEach((icon) => {
                if (icon.callback) icon.hasCallback = true;
                icon.visible ??= hasPermission;
            });
            this._systemIcons = icons;
            if (!icons || !icons?.length) return { resource: null, tooltip: null };
            return {
                resource: sett >= 2 ? icons : null,
                tooltip: sett == 1 || sett == 3 ? icons : null,
            };
        } catch (e) {
            console.error(e);
            return { resource: null, tooltip: null };
        }
    }

    getBorderColor(tokenDocument) {
        if (!game.settings.get(MODULE_ID, "showDispositionColor") || !tokenDocument) return "#000";
        
        function getColor() {
            const colors = CONFIG.Canvas.dispositionColors;
            if ( tokenDocument.isOwner && !game.user.isGM ) return colors.CONTROLLED;
            const D = CONST.TOKEN_DISPOSITIONS;
            switch ( tokenDocument.disposition ) {
              case D.SECRET: return colors.SECRET;
              case D.HOSTILE: return colors.HOSTILE;
              case D.NEUTRAL: return colors.NEUTRAL;
              case D.FRIENDLY: return tokenDocument.actor?.hasPlayerOwner ? colors.PARTY : colors.FRIENDLY;
              default: return colors.NEUTRAL;
            }
        }

        return new Color(getColor()).toString();
    }

    destroy() {
        // Clean up event listeners
        if (this._actionClickHandler) {
            this.element?.removeEventListener("click", this._actionClickHandler);
        }
        this.element?.remove();
    }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
