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
let lastRefresh = 0;

/* ELIMINACIÓN PROACTIVA: el token muere cuando hay un login posterior en el
 * mismo navegador (el sid rota). La pestaña vieja siempre RECUPERA EL FOCO
 * antes de que alguien imprima en ella — ahí renovamos el token en silencio,
 * así la ventana de falla deja de existir (el handler de abajo queda como
 * último respaldo). Throttle de 60s para no hacer ruido. */
async function refreshCsrfToken() {
    const now = Date.now();
    if (refreshing || now - lastRefresh < 60000) {
        return;
    }
    refreshing = true;
    try {
        const info = await rpc("/web/session/get_session_info", {});
        if (info && info.csrf_token) {
            odoo.csrf_token = info.csrf_token;
            lastRefresh = Date.now();
        }
    } catch {
        // sin red o sesión muerta: el flujo normal de Odoo lo maneja
    } finally {
        refreshing = false;
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        refreshCsrfToken();
    }
});
window.addEventListener("focus", () => refreshCsrfToken());
/* Odoo 19 rota el sid PERIÓDICAMENTE aunque no haya re-login (http.py:
 * create_time + SESSION_ROTATION_INTERVAL). Una pestaña que nunca pierde el
 * foco también cruza esa rotación: renovación silenciosa cada 15 min para
 * que el token jamás quede atrás. */
setInterval(() => {
    if (document.visibilityState === "visible") {
        refreshCsrfToken();
    }
}, 15 * 60 * 1000);

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
