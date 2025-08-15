import {MODULE_ID} from "../main.js";

const SHOWN_KEY = "chat-welcome-message-shown";

export function showWelcome() {
    if (!game.user.isGM) return;
    const module = game.modules.get(MODULE_ID);
    const VIDEO_ID = "2Iq_so_GsLA";
    const EMBEDDED_VIDEO = `<iframe width="100%" height="auto" src="https://www.youtube.com/embed/${VIDEO_ID}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    const WIKI_URL = `https://github.com/Emchtastic/tides-of-battle`;
    const MESSAGE = `<h1>${module.title}</h1>
    <p>by <a href="https://github.com/Emchtastic">Emchtastic</a></p>
    <p><strong>New to ${module.title}? Visit the <a href="${WIKI_URL}">GitHub Repository</a> for documentation and resources.</strong></p>
    ${VIDEO_ID ? EMBEDDED_VIDEO : ""}
    <p>This module builds upon the excellent foundation of <a href="https://github.com/theripper93/combat-tracker-dock">Carousel Combat Tracker</a> by theripper93.</p>
    <p><strong>Explore project resources:</strong></p> <ul>
    <li><a href="https://github.com/Emchtastic/tides-of-battle">GitHub Repository</a></li>
    <li><a href="https://github.com/Emchtastic/tides-of-battle/issues">Report Issues</a></li>
    <li><a href="https://github.com/Emchtastic">More Projects by Emchtastic</a></li>
    </ul>`;


    game.settings.register(MODULE_ID, SHOWN_KEY, {
        default: false,
        type: Boolean,
        scope: "world",
        config: false,
    });

    if (!game.settings.get(MODULE_ID, SHOWN_KEY)) {

        ChatMessage.create({
            user: game.user.id,
            whisper: game.users.filter(u => u.isGM).map(u => u.id),
            blind: true,
            content: MESSAGE,
        });

        game.settings.set(MODULE_ID, SHOWN_KEY, true);
    }
}
