/**
 * Modern List View Theme v3.1 - Column width enforcement
 * Alphaqueb Consulting SAS
 *
 * Objetivo:
 *  - Respetar SIEMPRE el ancho mínimo necesario para mostrar completo
 *    el nombre del encabezado de cada columna.
 *  - Aplicar tanto a listas principales como a listas embebidas en formularios.
 *  - Permitir scroll horizontal real, en lugar de comprimir columnas.
 *  - Excluir únicamente reportes/tablas especiales que no deben tocarse.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────────────────────
// Detectar tablas que NO deben ser afectadas
// SOLO excluimos reportes/tablas especiales.
// YA NO excluimos one2many/many2many embebidos.
// ─────────────────────────────────────────────────────────────────────────────
function shouldSkipTable(tableEl) {
    return !!tableEl.closest(
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
// Forzar tabla expandible real
// ─────────────────────────────────────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

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
// Calcular ancho mínimo real del header
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

    const contentWidth = Math.ceil(target.scrollWidth || th.scrollWidth || 0);

    const sortIcon = th.querySelector(".fa, .oi, .o_sort_indicator");
    const iconExtra = sortIcon ? 18 : 8;

    return Math.ceil(contentWidth + padLeft + padRight + borderLeft + borderRight + iconExtra);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar ancho mínimo por columna
// ─────────────────────────────────────────────────────────────────────────────
function syncColumnMinimumWidths(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerRow = tableEl.querySelector("thead tr");
    if (!headerRow) return;

    const headerCells = [...headerRow.children];
    if (!headerCells.length) return;

    // Reset previo
    headerCells.forEach((th, index) => {
        if (isSpecialColumn(th)) return;

        th.style.minWidth = "";
        th.style.width = "";
        th.style.maxWidth = "";

        tableEl
            .querySelectorAll(`tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`)
            .forEach((cell) => {
                cell.style.minWidth = "";
                cell.style.width = "";
                cell.style.maxWidth = "";
            });
    });

    requestAnimationFrame(() => {
        headerCells.forEach((th, index) => {
            if (isSpecialColumn(th)) return;

            // Puedes subir este piso si quieres más aire visual
            const minWidth = Math.max(getHeaderRequiredWidth(th), 140);

            if (!minWidth || Number.isNaN(minWidth)) return;

            th.style.minWidth = `${minWidth}px`;
            th.style.width = `${minWidth}px`;
            th.style.maxWidth = "none";

            tableEl
                .querySelectorAll(`tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`)
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
    if (!tableEl || shouldSkipTable(tableEl)) return;

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
    if (!tableEl || shouldSkipTable(tableEl)) return;

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
// Reaplicar globalmente
// ─────────────────────────────────────────────────────────────────────────────
function reapplyAllTables() {
    document.querySelectorAll("table.o_list_table").forEach((tableEl) => {
        applyModernListSizing(tableEl);
    });
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        _mo.observe(document.body, { childList: true, subtree: true });

        window.addEventListener("resize", () => {
            window.requestAnimationFrame(reapplyAllTables);
        });

        // Reaplicar por si la fuente o el render tardan un poco
        setTimeout(reapplyAllTables, 150);
        setTimeout(reapplyAllTables, 500);
    },
    { once: true }
);