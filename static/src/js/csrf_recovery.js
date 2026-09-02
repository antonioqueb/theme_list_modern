/** @odoo-module **/
/* Auto-recuperación del error "Session expired (invalid CSRF token)".
 *
 * Ocurre al IMPRIMIR desde una pestaña abierta de antes de un re-login: el
 * token CSRF de la pestaña quedó ligado al sid anterior. download.js lee
 * odoo.csrf_token EN CADA clic, así que basta renovar ese global y volver a
 * intentar — sin recargar la pestaña y sin traceback intimidante. */
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";

const CSRF_RE = /CSRF|Session expired/i;

function looksLikeCsrfError(error, originalError) {
    const candidates = [
        error && error.message,
        originalError && originalError.message,
        originalError && originalError.data && originalError.data.message,
        originalError && originalError.subType,
    ];
    return candidates.some((text) => typeof text === "string" && CSRF_RE.test(text));
}

let refreshing = false;

function csrfRecoveryHandler(env, error, originalError) {
    if (!looksLikeCsrfError(error, originalError)) {
        return false;
    }
    if (!refreshing) {
        refreshing = true;
        rpc("/web/session/get_session_info", {})
            .then((info) => {
                if (info && info.csrf_token) {
                    odoo.csrf_token = info.csrf_token;
                }
            })
            .catch(() => {})
            .finally(() => {
                refreshing = false;
            });
    }
    env.services.notification.add(
        _t(
            "Tu sesión cambió desde que se abrió esta pestaña (inicio de sesión reciente). " +
            "Ya se renovó en automático: vuelve a dar clic en Imprimir."
        ),
        { title: _t("Sesión renovada"), type: "warning", sticky: false }
    );
    return true; // manejado: sin diálogo de traceback
}

// Antes del manejador genérico de RPC (que abre el diálogo de error).
registry.category("error_handlers").add(
    "theme_list_modern.csrf_recovery",
    csrfRecoveryHandler,
    { sequence: 50 }
);
