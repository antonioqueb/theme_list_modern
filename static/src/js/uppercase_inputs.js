/** @odoo-module **/

/**
 * Escritura SIEMPRE en MAYÚSCULAS en el backend.
 *
 * Todo lo que el usuario teclea en campos de texto de los modelos
 * (contactos, proyectos, ventas, compras, productos, etc.) se convierte a
 * mayúsculas al momento, conservando la posición del cursor.
 *
 * Fuera de alcance (a propósito):
 *  - Login y portal: este archivo solo carga en web.assets_backend.
 *  - Correos, URLs, contraseñas y HTML (widgets o_field_email/url/html).
 *  - Campos técnicos donde el case importa (login, llaves, dominios,
 *    códigos de secuencia, parámetros del sistema...).
 *  - Buscadores y cualquier input que no sea un campo de modelo.
 */

const SKIP_INPUT_TYPES = new Set([
    "password", "email", "url", "number", "date", "datetime-local",
    "time", "month", "week", "file", "range", "color", "checkbox", "radio",
]);

const SKIP_FIELD_NAMES = new Set([
    "login", "email", "email_from", "email_cc", "email_to", "email_normalized",
    "website", "url", "link", "path",
    "key", "value", "api_key", "code", "domain", "context", "arch", "xml_id",
    "technical_name", "signature",
]);

const SKIP_WIDGET_SELECTOR = [
    ".o_field_email",
    ".o_field_url",
    ".o_field_html",
    ".o_field_binary",
    ".o_field_many2one",       // el input del m2o es búsqueda, no captura
    ".o_field_many2many_tags", // ídem
    ".ace_editor",
    ".o_code_editor",
].join(", ");

function shouldUppercase(el) {
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
        return false;
    }
    if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) {
        return false;
    }
    // Solo dentro del webclient (jamás login/portal, que además no cargan
    // este bundle) y solo en campos de modelo (no buscadores/filtros).
    if (!el.closest(".o_web_client")) {
        return false;
    }
    const widget = el.closest(".o_field_widget");
    if (!widget) {
        return false;
    }
    if (widget.closest(SKIP_WIDGET_SELECTOR)) {
        return false;
    }
    // Solo char/text planos.
    if (!widget.matches(".o_field_char, .o_field_text")) {
        return false;
    }
    const name = widget.getAttribute("name") || el.getAttribute("name") || "";
    if (SKIP_FIELD_NAMES.has(name)) {
        return false;
    }
    return true;
}

function toUpper(el) {
    const value = el.value;
    const upper = value.toUpperCase();
    if (value === upper) {
        return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = upper;
    try {
        el.setSelectionRange(start, end);
    } catch {
        // inputs sin selección (p. ej. hidden): irrelevante
    }
}

// Captura: corre ANTES de los handlers de OWL, que leen el .value ya en
// mayúsculas. isComposing evita romper acentos con teclas muertas (´ + a).
document.addEventListener("input", (ev) => {
    if (ev.isComposing) {
        return;
    }
    if (shouldUppercase(ev.target)) {
        toUpper(ev.target);
    }
}, true);

// Cierre de composición (acentos/IME) y pegado: el 'change' lo remata.
document.addEventListener("change", (ev) => {
    if (shouldUppercase(ev.target)) {
        toUpper(ev.target);
    }
}, true);
