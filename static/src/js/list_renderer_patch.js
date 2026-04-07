/**
 * Modern List View Theme v3 - Column width enforcement
 * Alphaqueb Consulting SAS
 *
 * Objetivo:
 *  - Respetar SIEMPRE el ancho mínimo necesario para mostrar completo
 *    el nombre del encabezado de cada columna.
 *  - Permitir scroll horizontal real, en lugar de comprimir columnas.
 *  - Mantener exclusiones para listas embebidas y reportes contables.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────────────────────
// Detectar tabla que NO debe ser afectada por el tema
// ─────────────────────────────────────────────────────────────────────────────
function isEmbeddedList(tableEl) {
    return !!tableEl.closest(
        ".o_form_view .o_field_one2many, " +
        ".o_form_view .o_field_many2many, " +
        ".o_form_view .o_field_widget .o_list_renderer, " +
        ".o_account_report_scroll_container, " +
        ".o_account_reports_page, " +
        ".o_account_report, " +
        ".o_account_financial_report, " +
        ".o_account_report_line, " +
        "[class*='account_report'], " +
        ".o_report_layout"
    );
}

function isSpecialColumn(th) {
    return (
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box") ||
        th.classList.contains("o_list_optional_columns_dropdown")
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla expandible real
// ─────────────────────────────────────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl || isEmbeddedList(tableEl)) return;

    tableEl.style.tableLayout = "auto";
    tableEl.style.width = "max-content";
    tableEl.style.minWidth = "100%";

    tableEl.querySelectorAll("thead th").forEach((th) => {
        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
        th.style.textOverflow = "clip";
        th.style.width = "auto";
    });

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcular ancho mínimo de header
// ─────────────────────────────────────────────────────────────────────────────
function getHeaderRequiredWidth(th) {
    const target =
        th.querySelector(".o_list_column_title") ||
        th.querySelector(".o_dropdown_button") ||
        th.firstElementChild ||
        th;

    const thStyle = window.getComputedStyle(th);
    const padLeft = parseFloat(thStyle.paddingLeft || "0");
    const padRight = parseFloat(thStyle.paddingRight || "0");
    const borderLeft = parseFloat(thStyle.borderLeftWidth || "0");
    const borderRight = parseFloat(thStyle.borderRightWidth || "0");

    // Ancho real del contenido interno
    const contentWidth = Math.ceil(target.scrollWidth || th.scrollWidth || 0);

    // Espacio extra por íconos de sort / respiración visual
    const sortIcon = th.querySelector(".fa, .oi, .o_sort_indicator");
    const iconExtra = sortIcon ? 18 : 8;

    return Math.ceil(contentWidth + padLeft + padRight + borderLeft + borderRight + iconExtra);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar ancho mínimo por columna
// ─────────────────────────────────────────────────────────────────────────────
function syncColumnMinimumWidths(tableEl) {
    if (!tableEl || isEmbeddedList(tableEl)) return;

    const headerRow = tableEl.querySelector("thead tr");
    if (!headerRow) return;

    const headerCells = [...headerRow.children];
    if (!headerCells.length) return;

    // Reset previo para medir sin arrastre
    headerCells.forEach((th, index) => {
        if (isSpecialColumn(th)) return;

        th.style.minWidth = "";
        th.style.width = "";

        tableEl.querySelectorAll(`tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`)
            .forEach((cell) => {
                cell.style.minWidth = "";
                cell.style.width = "";
            });
    });

    // Medimos después del render estable
    requestAnimationFrame(() => {
        headerCells.forEach((th, index) => {
            if (isSpecialColumn(th)) return;

            const minWidth = Math.max(getHeaderRequiredWidth(th), 160);
            if (!minWidth || Number.isNaN(minWidth)) return;

            // Header
            th.style.minWidth = `${minWidth}px`;
            th.style.width = `${minWidth}px`;
            th.style.maxWidth = "none";

            // Celdas del cuerpo y footer en la misma columna
            tableEl.querySelectorAll(`tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`)
                .forEach((cell) => {
                    if (cell.classList.contains("o_list_record_selector")) return;
                    cell.style.minWidth = `${minWidth}px`;
                    cell.style.width = `${minWidth}px`;
                    cell.style.maxWidth = "none";
                });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltips en celdas truncadas
// ─────────────────────────────────────────────────────────────────────────────
function addCellTooltips(tableEl) {
    if (!tableEl || isEmbeddedList(tableEl)) return;

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

// ─────────────────────────────────────────────────────────────────────────────
// Aplicación global
// ─────────────────────────────────────────────────────────────────────────────
function applyModernListSizing(tableEl) {
    if (!tableEl || isEmbeddedList(tableEl)) return;
    enforceTableExpansion(tableEl);
    syncColumnMinimumWidths(tableEl);
    addCellTooltips(tableEl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch al ListRenderer
// ─────────────────────────────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const apply = () => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) {
                applyModernListSizing(tableEl);
            }
        };

        onMounted(() => apply());
        onPatched(() => {
            setTimeout(apply, 0);
            requestAnimationFrame(apply);
        });
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// MutationObserver global
// ─────────────────────────────────────────────────────────────────────────────
const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : [...(node.querySelectorAll?.(".o_list_table") || [])];

            for (const t of tables) {
                applyModernListSizing(t);
            }
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reaplicar en resize
// ─────────────────────────────────────────────────────────────────────────────
function reapplyAllTables() {
    document.querySelectorAll("table.o_list_table").forEach((tableEl) => {
        applyModernListSizing(tableEl);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    _mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("resize", () => {
        window.requestAnimationFrame(reapplyAllTables);
    });

    // Reaplicar una vez más por si la fuente web termina de cargar después
    setTimeout(reapplyAllTables, 150);
    setTimeout(reapplyAllTables, 500);
}, { once: true });