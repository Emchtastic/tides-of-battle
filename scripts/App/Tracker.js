import { MODULE_ID } from "../main.js";
import { AddEvent } from "./AddEvent.js";

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
        return Array.from(this.combat.combatants.contents.sort(this.combat._sortCombatants));
    }

    get autoFit() {
        return game.settings.get(MODULE_ID, "overflowStyle") == "autofit";
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
        return {
            isGM: game.user.isGM,
            scroll,
        };
    }

    setupCombatants() {
        this.portraits = [];
        this.sortedCombatants.forEach((combatant) => this.portraits.push(new CONFIG.combatTrackerDock.CombatantPortrait(combatant)));
        const combatantsContainer = this.element[0].querySelector("#combatants");
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
        const portraitSize = Math.min(max, Math.floor(maxSpace / combatantCount));
        
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
        startButton.style.display = this.combat.started ? "none" : "";
        endButton.style.display = this.combat.started ? "" : "none";
    }

    appendHtml(){
        return document.querySelector("#ui-top").prepend(this.element[0]);
    }

    activateListeners(html) {
        if (this._closed) return this.close();
        super.activateListeners(html);
        this.setupCombatants();
        this.appendHtml();
        this.element[0].querySelectorAll(".buttons-container i").forEach((i) => {
            i.addEventListener("click", (e) => {
                const action = e.currentTarget.dataset.action;
                switch (action) {
                    case "previous-turn":
                        this.combat.previousTurn();
                        break;
                    case "next-turn":
                        this.combat.nextTurn();
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
                    case "add-event":
                        new AddEvent(this.combat).render(true);
                        break;
                }
            });
        });
        this.autosize();
        this.setControlsOrder();
    }

    _onRenderCombatTracker() {
        this.portraits.forEach((p) => p.renderInner());
        this.updateStartEndButtons();
    }

    _onCombatTurn(combat, updates, update) {
        if (!("turn" in updates) && !("round" in updates)) return;
        if ("round" in updates) this._onRoundChange();
        const combatantsContainer = this.element[0].querySelector("#combatants");
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
        const uiLeft = this.element[0].querySelector(".buttons-container.left");
        const uiRight = this.element[0].querySelector(".buttons-container.right");
        const combatants = this.element[0].querySelector("#combatants");
        
        uiLeft.style.order = "";
        uiRight.style.order = "";
        combatants.style.order = "";
        uiLeft.style.marginRight = "";
        uiRight.style.marginLeft = "";
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
