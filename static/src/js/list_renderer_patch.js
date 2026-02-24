/**
 * Modern List View Theme v2 - ListRenderer Patch
 * Alphaqueb Consulting SAS
 *
 * Estrategia v2:
 *  - table-layout: auto + min-width: max-content forzado vía JS
 *  - El contenedor scrollea horizontalmente, la tabla nunca comprime columnas
 *  - Tooltips en celdas truncadas (solo cuando la celda sí está truncada)
 *  - Sin measureText hacky — dejamos que el browser calcule anchos reales
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─── Forzar tabla no comprimida ───────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl) return;

    // Tabla: auto layout, nunca comprimir
    tableEl.style.tableLayout = "auto";
    tableEl.style.minWidth = "max-content";
    tableEl.style.width = "100%";

    // Todos los th: no truncar nunca
    tableEl.querySelectorAll("thead th").forEach((th) => {
        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
        th.style.textOverflow = "clip";
    });

    // Celdas de datos: white-space nowrap para que el contenido dicte el ancho
    // Quitamos max-width:0 que causaba truncado forzado
    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
        td.style.maxWidth = "";   // eliminar cualquier max-width heredado
    });
}

// ─── Tooltips en celdas truncadas ────────────────────────────────────────────
function addCellTooltips(tableEl) {
    if (!tableEl) return;

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
            // Buscar la tabla dentro del componente
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) {
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