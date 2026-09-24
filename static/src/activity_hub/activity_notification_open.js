/** @odoo-module **/
/**
 * Aviso de actividad en el systray de mensajes → abre el Centro de
 * Actividades con esa actividad resaltada (en vez del documento).
 *
 * El aviso lo manda mail.activity.action_notify (som_activity_hub.py) con
 * `data-som-activity-id` en el cuerpo; aquí solo se lee ese id.
 */
import { patch } from "@web/core/utils/patch";
import { MessagingMenu } from "@mail/core/public_web/messaging_menu";

const RE_ACTIVITY = /data-som-activity-id="(\d+)"/;
const RE_HUB = /data-som-activity-hub="1"/;

/** id de actividad (aviso individual), -1 si es un resumen (abre el Centro sin resaltar), 0 si no es aviso SOM. */
function somActivityIdOf(message) {
    const body = message && message.body ? String(message.body) : "";
    const m = body.match(RE_ACTIVITY);
    if (m) {
        return Number(m[1]);
    }
    return RE_HUB.test(body) ? -1 : 0;
}

patch(MessagingMenu.prototype, {
    _somOpenActivity(message, activityId) {
        try {
            if (message.needaction && typeof message.setDone === "function") {
                message.setDone();
            }
        } catch (e) {
            console.warn("[SOM ACTIVITY HUB] no se pudo marcar leído el aviso", e);
        }
        this.dropdown.close();
        this.env.services.action.doAction({
            type: "ir.actions.client",
            tag: "theme_list_modern.activity_hub",
            name: "Actividades",
            params: activityId > 0 ? { som_activity_id: activityId } : {},
        });
    },
    onClickThread(isMarkAsRead, thread, message) {
        const activityId = !isMarkAsRead ? somActivityIdOf(message) : 0;
        if (activityId) {
            return this._somOpenActivity(message, activityId);
        }
        return super.onClickThread(isMarkAsRead, thread, message);
    },
    onClickInboxMsg(isMarkAsRead, msg) {
        const activityId = !isMarkAsRead ? somActivityIdOf(msg) : 0;
        if (activityId) {
            return this._somOpenActivity(msg, activityId);
        }
        return super.onClickInboxMsg(isMarkAsRead, msg);
    },
});
