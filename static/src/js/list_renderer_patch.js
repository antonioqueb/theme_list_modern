/**
 * Modern List View Theme v3.3 - Stable column width enforcement
 * Alphaqueb Consulting SAS
 *
 * Objetivo:
 *  - Respetar SIEMPRE el ancho mínimo necesario para mostrar completo
 *    el nombre del encabezado de cada columna.
 *  - Aplicar tanto a listas principales como a listas embebidas.
 *  - Evitar que columnas técnicas (drag, favorito, selector, acciones, stone toggle)
 *    se expandan incorrectamente.
 *  - Recalcular automáticamente al abrir la vista, sin requerir refresh manual.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────────────────────
// Tablas que NO deben tocarse
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

// ─────────────────────────────────────────────────────────────────────────────
// Columnas técnicas que NO deben entrar al cálculo dinámico
// ─────────────────────────────────────────────────────────────────────────────
function isSpecialColumn(th) {
    if (!th) return true;

    const className = th.className || "";
    const text = (th.textContent || "").trim();
    const dataName = th.getAttribute("data-name") || th.getAttribute("name") || "";

    return (
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box") ||
        th.classList.contains("o_list_optional_columns_dropdown") ||
        th.classList.contains("o_handle_cell") ||
        th.classList.contains("o_row_handle") ||
        th.classList.contains("o_list_button") ||
        th.classList.contains("o_list_action") ||
        th.classList.contains("o_list_record_remove") ||
        th.classList.contains("o_field_handle") ||
        th.classList.contains("o_stone_toggle_column") ||
        dataName === "is_stone_expanded" ||
        /handle|selector|selection|optional|remove|action/.test(className) ||
        (
            text === "" &&
            (
                th.querySelector(".fa") ||
                th.querySelector(".oi") ||
                th.querySelector(".btn") ||
                th.querySelector(".dropdown-toggle") ||
                th.querySelector(".o_handle_cell") ||
                th.querySelector(".o_row_handle") ||
                th.querySelector(".o_optional_columns_dropdown_toggle")
            )
        )
    );
}

function getSpecialColumnWidth(th) {
    if (!th) return 30;

    const className = th.className || "";
    const dataName = th.getAttribute("data-name") || th.getAttribute("name") || "";

    if (
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box")
    ) {
        return 30;
    }

    if (th.classList.contains("o_list_optional_columns_dropdown")) {
        return 30;
    }

    if (
        th.classList.contains("o_handle_cell") ||
        th.classList.contains("o_row_handle") ||
        /handle/.test(className)
    ) {
        return 30;
    }

    if (
        th.classList.contains("o_stone_toggle_column") ||
        dataName === "is_stone_expanded"
    ) {
        return 30;
    }

    if (
        th.classList.contains("o_list_record_remove") ||
        th.classList.contains("o_list_action") ||
        /remove|action/.test(className)
    ) {
        return 30;
    }

    return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla expandible real
// ─────────────────────────────────────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    tableEl.style.tableLayout = "auto";
    tableEl.style.width = "max-content";
    tableEl.style.minWidth = "100%";

    tableEl.querySelectorAll("thead th").forEach((th) => {
        if (isSpecialColumn(th)) {
            const fixedWidth = getSpecialColumnWidth(th);
            th.style.minWidth = `${fixedWidth}px`;
            th.style.width = `${fixedWidth}px`;
            th.style.maxWidth = `${fixedWidth}px`;
            th.style.whiteSpace = "nowrap";
            th.style.overflow = "hidden";
            th.style.textOverflow = "clip";
            return;
        }

        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
        th.style.textOverflow = "clip";
        th.style.width = "auto";
        th.style.maxWidth = "none";
    });

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Medir ancho real del header
// ─────────────────────────────────────────────────────────────────────────────
function getHeaderRequiredWidth(th) {
    const titleEl =
        th.querySelector(".o_list_column_title") ||
        th.querySelector(".o_column_title") ||
        th.querySelector("span") ||
        th;

    const thStyle = window.getComputedStyle(th);
    const padLeft = parseFloat(thStyle.paddingLeft || "0");
    const padRight = parseFloat(thStyle.paddingRight || "0");
    const borderLeft = parseFloat(thStyle.borderLeftWidth || "0");
    const borderRight = parseFloat(thStyle.borderRightWidth || "0");

    const titleWidth = Math.ceil(titleEl.scrollWidth || titleEl.getBoundingClientRect().width || 0);

    const hasSortIcon = !!th.querySelector(".fa, .oi, .o_sort_indicator");
    const extra = hasSortIcon ? 18 : 8;

    return Math.ceil(titleWidth + padLeft + padRight + borderLeft + borderRight + extra);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar anchos por columna
// ─────────────────────────────────────────────────────────────────────────────
function syncColumnMinimumWidths(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerRow = tableEl.querySelector("thead tr");
    if (!headerRow) return;

    const headerCells = [...headerRow.children];
    if (!headerCells.length) return;

    // Reset previo
    headerCells.forEach((th, index) => {
        const columnCells = tableEl.querySelectorAll(
            `tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`
        );

        if (isSpecialColumn(th)) {
            const fixedWidth = getSpecialColumnWidth(th);

            th.style.minWidth = `${fixedWidth}px`;
            th.style.width = `${fixedWidth}px`;
            th.style.maxWidth = `${fixedWidth}px`;

            columnCells.forEach((cell) => {
                cell.style.minWidth = `${fixedWidth}px`;
                cell.style.width = `${fixedWidth}px`;
                cell.style.maxWidth = `${fixedWidth}px`;
            });
            return;
        }

        th.style.minWidth = "";
        th.style.width = "";
        th.style.maxWidth = "";

        columnCells.forEach((cell) => {
            cell.style.minWidth = "";
            cell.style.width = "";
            cell.style.maxWidth = "";
        });
    });

    requestAnimationFrame(() => {
        headerCells.forEach((th, index) => {
            if (isSpecialColumn(th)) return;

            const minWidth = Math.max(getHeaderRequiredWidth(th), 140);
            if (!minWidth || Number.isNaN(minWidth)) return;

            th.style.minWidth = `${minWidth}px`;
            th.style.width = `${minWidth}px`;
            th.style.maxWidth = "none";

            tableEl.querySelectorAll(
                `tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`
            ).forEach((cell) => {
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
// Aplicación completa
// ─────────────────────────────────────────────────────────────────────────────
function applyModernListSizing(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;
    enforceTableExpansion(tableEl);
    syncColumnMinimumWidths(tableEl);
    addCellTooltips(tableEl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaplicar en fases para esperar estabilización real del DOM
// ─────────────────────────────────────────────────────────────────────────────
function scheduleApply(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const run = () => applyModernListSizing(tableEl);

    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 60);
    setTimeout(run, 180);
    setTimeout(run, 320);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch ListRenderer
// ─────────────────────────────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const apply = () => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) {
                scheduleApply(tableEl);
            }
        };

        onMounted(() => apply());
        onPatched(() => apply());
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Observer global
// ─────────────────────────────────────────────────────────────────────────────
const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : [...(node.querySelectorAll?.(".o_list_table") || [])];

            for (const t of tables) {
                scheduleApply(t);
            }
        }
    }
});

function reapplyAllTables() {
    document.querySelectorAll("table.o_list_table").forEach((tableEl) => {
        scheduleApply(tableEl);
    });
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        _mo.observe(document.body, { childList: true, subtree: true });

        window.addEventListener("resize", () => {
            window.requestAnimationFrame(reapplyAllTables);
        });

        setTimeout(reapplyAllTables, 150);
        setTimeout(reapplyAllTables, 400);
        setTimeout(reapplyAllTables, 800);
    },
    { once: true }
);