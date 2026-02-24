/**
 * Modern List View Theme v2 - ListRenderer Patch
 * Alphaqueb Consulting SAS
 *
 * Estrategia v2:
 *  - table-layout: auto + min-width: max-content forzado vía JS
 *  - El contenedor scrollea horizontalmente, la tabla nunca comprime columnas
 *  - Tooltips en celdas truncadas (solo cuando la celda sí está truncada)
 *  - Sin measureText hacky — dejamos que el browser calcule anchos reales
 *  - Listas embebidas en formularios (one2many/many2many) quedan excluidas
 *  - Reportes contables (balance, libro mayor, etc.) quedan excluidos
 */
import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─── Detectar lista embebida en formulario o reporte contable ─────────────────
function isEmbeddedList(tableEl) {
    return !!tableEl.closest(
        ".o_form_view .o_field_one2many, " +
        ".o_form_view .o_field_many2many, " +
        ".o_form_view .o_field_widget .o_list_renderer, " +
        ".o_account_reports_page, " +
        ".o_account_report, " +
        ".o_account_financial_report, " +
        ".o_account_report_line, " +
        "[class*='account_report'], " +
        ".o_report_layout"
    );
}

// ─── Forzar tabla no comprimida ───────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl) return;
    if (isEmbeddedList(tableEl)) return;

    tableEl.style.tableLayout = "auto";
    tableEl.style.minWidth = "max-content";
    tableEl.style.width = "100%";

    tableEl.querySelectorAll("thead th").forEach((th) => {
        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
        th.style.textOverflow = "clip";
    });

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
        td.style.maxWidth = "";
    });
}

// ─── Tooltips en celdas truncadas ────────────────────────────────────────────
function addCellTooltips(tableEl) {
    if (!tableEl) return;
    if (isEmbeddedList(tableEl)) return;

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        if (td._mlvTip) return;
        td._mlvTip = true;
        td.addEventListener("mouseenter", () => {
            if (td.scrollWidth > td.clientWidth + 2) {
                td.setAttribute("title", td.textContent.trim());
            } else {
                td.removeAttribute("title");
            }
        });
    });
}

// ─── Patch al ListRenderer ────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const apply = () => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl && !isEmbeddedList(tableEl)) {
                enforceTableExpansion(tableEl);
                addCellTooltips(tableEl);
            }
        };

        onMounted(() => apply());
        onPatched(() => setTimeout(apply, 0));
    },
});

// ─── MutationObserver global — captura tablas que entren al DOM ───────────────
const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : [...(node.querySelectorAll?.(".o_list_table") || [])];
            for (const t of tables) {
                enforceTableExpansion(t);
                addCellTooltips(t);
            }
        }
    }
});

document.addEventListener("DOMContentLoaded", () => {
    _mo.observe(document.body, { childList: true, subtree: true });
}, { once: true });