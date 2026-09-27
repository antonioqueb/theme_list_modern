/** @odoo-module **/
/**
 * Aviso de actividad en el systray de mensajes → abre su destino en vez de
 * la bandeja de Discuss:
 *   - autorizaciones: la SOLICITUD (precios, entrega, descuento…), el enlace
 *     del aviso es /odoo/<modelo>/<id>?som_activity_id=N;
 *   - el resto: el Centro de Actividades con esa actividad resaltada, el
 *     enlace es /odoo/action-theme_list_modern.activity_hub?som_activity_id=N;
 *   - resumen de puesta al día: el Centro sin resaltar.
 *
 * El aviso lo manda mail.activity.action_notify (som_activity_hub.py). El
 * sanitizador de Odoo borra los atributos data-* del cuerpo, así que el
 * destino se lee del ENLACE del aviso (los data-* quedan como respaldo).
 */
import { patch } from "@web/core/utils/patch";
import { MessagingMenu } from "@mail/core/public_web/messaging_menu";

const RE_HUB_LINK = /\/odoo\/action-theme_list_modern\.activity_hub(?:\?som_activity_id=(\d+))?/;
const RE_RECORD_LINK = /\/odoo\/([a-z_][\w.]*)\/(\d+)\?som_activity_id=(\d+)/;
const RE_ACTIVITY = /data-som-activity-id="(\d+)"/;
const RE_HUB = /data-som-activity-hub="1"/;

/**
 * Destino del aviso SOM, o null si no es un aviso SOM:
 *   { record: { model, id } }   → abrir el registro (autorizaciones)
 *   { activityId: N }           → Centro con la actividad resaltada
 *   { activityId: -1 }          → Centro sin resaltar (resumen)
 */
function somTargetOf(message) {
    const body = message && message.body ? String(message.body) : "";
    let m = body.match(RE_RECORD_LINK);
    if (m) {
        return { record: { model: m[1], id: Number(m[2]) } };
    }
    m = body.match(RE_HUB_LINK);
    if (m) {
        return { activityId: m[1] ? Number(m[1]) : -1 };
    }
    m = body.match(RE_ACTIVITY);
    if (m) {
        return { activityId: Number(m[1]) };
    }
    return RE_HUB.test(body) ? { activityId: -1 } : null;
}

patch(MessagingMenu.prototype, {
    _somOpenTarget(message, target) {
        try {
            if (message.needaction && typeof message.setDone === "function") {
                message.setDone();
            }
        } catch (e) {
            console.warn("[SOM ACTIVITY HUB] no se pudo marcar leído el aviso", e);
        }
        this.dropdown.close();
        if (target.record) {
            this.env.services.action.doAction({
                type: "ir.actions.act_window",
                res_model: target.record.model,
                res_id: target.record.id,
                views: [[false, "form"]],
                target: "current",
            });
            return;
        }
        this.env.services.action.doAction({
            type: "ir.actions.client",
            tag: "theme_list_modern.activity_hub",
            name: "Actividades",
            params: target.activityId > 0 ? { som_activity_id: target.activityId } : {},
        });
    },
    onClickThread(isMarkAsRead, thread, message) {
        const target = !isMarkAsRead ? somTargetOf(message) : null;
        if (target) {
            return this._somOpenTarget(message, target);
        }
        return super.onClickThread(isMarkAsRead, thread, message);
    },
    onClickInboxMsg(isMarkAsRead, msg) {
        const target = !isMarkAsRead ? somTargetOf(msg) : null;
        if (target) {
            return this._somOpenTarget(msg, target);
        }
        return super.onClickInboxMsg(isMarkAsRead, msg);
    },
});
