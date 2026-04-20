/**
 * Modern List View Theme v3.8 - UX optimizado sin flicker
 * Alphaqueb Consulting SAS
 *
 * v3.8:
 *  - Eliminadas las múltiples reaplicaciones en cascada (6 setTimeout).
 *  - Tabla oculta (visibility:hidden) hasta que termina el primer cálculo,
 *    evita el "flash" de columnas enormes en la primera apertura.
 *  - Reset + medición + aplicación en un solo pase sincrónico (sin rAF
 *    intermedio que causaba dos repintados visibles).
 *  - MutationObserver con debounce (16ms): no dispara cascadas.
 *  - En re-renders posteriores no se oculta la tabla; sólo la primera vez.
 *
 * v3.7:
 *  - Soporte para columnas con ancho FIJO forzado (FIXED_WIDTH_COLUMNS).
 *
 * v3.6:
 *  - getSelectorWidgetFloor lee style="width:Xpx" de la vista.
 *  - Fallback generoso de 280px para widgets selector.
 *
 * v3.5 - v3.3:
 *  - Detección de <select>, medición de contenido, anchos por header,
 *    evitar expansión de columnas técnicas.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────────────────────
// Columnas con ancho FIJO forzado (NO entran al cálculo dinámico).
// ─────────────────────────────────────────────────────────────────────────────
const FIXED_WIDTH_COLUMNS = {
    "x_price_selector": 220,
     "x_project_id": 250,
};

function getFixedWidthForColumn(th) {
    if (!th) return 0;
    const dataName = th.getAttribute("data-name") || th.getAttribute("name") || "";
    return FIXED_WIDTH_COLUMNS[dataName] || 0;
}

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
// Columnas técnicas
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

function getSpecialColumnWidth() {
    return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla expandible real (estilos base del tableEl)
// ─────────────────────────────────────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    tableEl.style.tableLayout = "auto";
    tableEl.style.width = "max-content";
    tableEl.style.minWidth = "100%";
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
// Medir texto arbitrario
// ─────────────────────────────────────────────────────────────────────────────
function measureText(text, styleSource) {
    if (!text) return 0;
    const measurer = document.createElement("span");
    const cs = window.getComputedStyle(styleSource);
    measurer.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: nowrap;
        top: -9999px;
        left: -9999px;
        font-family: ${cs.fontFamily};
        font-size: ${cs.fontSize};
        font-weight: ${cs.fontWeight};
        letter-spacing: ${cs.letterSpacing};
        text-transform: ${cs.textTransform};
    `;
    measurer.textContent = text;
    document.body.appendChild(measurer);
    const width = Math.ceil(measurer.getBoundingClientRect().width);
    document.body.removeChild(measurer);
    return width;
}

function getSelectRequiredWidth(selectEl) {
    if (!selectEl) return 0;
    let maxOptionWidth = 0;
    for (let i = 0; i < selectEl.options.length; i++) {
        const optText = selectEl.options[i].textContent || "";
        const w = measureText(optText, selectEl);
        if (w > maxOptionWidth) maxOptionWidth = w;
    }
    return maxOptionWidth + 40;
}

function getSelectorWidgetFloor(cell) {
    if (!cell) return 0;

    const selectorEl = cell.querySelector(
        "[class*='selector'], [class*='__label'], .o_field_selection, .o_field_radio"
    );
    if (!selectorEl) return 0;

    const candidates = [
        cell,
        cell.querySelector("[style*='width']"),
        cell.closest("[style*='width']"),
    ].filter(Boolean);

    for (const el of candidates) {
        const style = el.getAttribute && el.getAttribute("style");
        if (style) {
            const match = style.match(/width\s*:\s*(\d+)\s*px/i);
            if (match) {
                return parseInt(match[1], 10) + 40;
            }
        }
    }

    return 280;
}

function getCellContentWidth(cell) {
    if (!cell) return 0;

    const cellStyle = window.getComputedStyle(cell);
    const padLeft = parseFloat(cellStyle.paddingLeft || "0");
    const padRight = parseFloat(cellStyle.paddingRight || "0");

    let contentWidth = 0;

    const selectEl = cell.querySelector("select");
    if (selectEl) {
        contentWidth = getSelectRequiredWidth(selectEl);
    }

    if (!contentWidth) {
        const inputEl = cell.querySelector("input[type='text'], input[type='number'], textarea");
        if (inputEl && inputEl.value) {
            contentWidth = measureText(inputEl.value, inputEl) + 24;
        }
    }

    if (!contentWidth) {
        contentWidth = Math.ceil(cell.scrollWidth || 0);
    }

    return Math.ceil(contentWidth + padLeft + padRight);
}

function getColumnSelectWidth(tableEl, columnIndex) {
    const selectEl = tableEl.querySelector(
        `tbody tr > *:nth-child(${columnIndex + 1}) select`
    );
    if (selectEl) {
        return getSelectRequiredWidth(selectEl);
    }
    return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar un ancho a columna (TH + todas las celdas)
// ─────────────────────────────────────────────────────────────────────────────
function applyColumnWidth(th, columnCells, width, hard) {
    th.style.minWidth = `${width}px`;
    th.style.width = `${width}px`;
    th.style.maxWidth = hard ? `${width}px` : "none";

    columnCells.forEach((cell) => {
        cell.style.minWidth = `${width}px`;
        cell.style.width = `${width}px`;
        cell.style.maxWidth = hard ? `${width}px` : "none";
    });
}

function resetColumnWidth(th, columnCells) {
    th.style.minWidth = "";
    th.style.width = "";
    th.style.maxWidth = "";
    columnCells.forEach((cell) => {
        cell.style.minWidth = "";
        cell.style.width = "";
        cell.style.maxWidth = "";
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcular y aplicar anchos (un solo pase sincrónico, sin rAF intermedio).
// ─────────────────────────────────────────────────────────────────────────────
function syncColumnMinimumWidths(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerRow = tableEl.querySelector("thead tr");
    if (!headerRow) return;

    const headerCells = [...headerRow.children];
    if (!headerCells.length) return;

    // Paso 1: Aplicar anchos fijos/especiales + resetear el resto.
    // Guardamos referencias a las columnas dinámicas para medir después.
    const dynamicColumns = [];

    headerCells.forEach((th, index) => {
        const columnCells = tableEl.querySelectorAll(
            `tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`
        );

        const fixedWidth = getFixedWidthForColumn(th);
        if (fixedWidth > 0) {
            applyColumnWidth(th, columnCells, fixedWidth, true);
            return;
        }

        if (isSpecialColumn(th)) {
            applyColumnWidth(th, columnCells, getSpecialColumnWidth(), true);
            return;
        }

        resetColumnWidth(th, columnCells);
        dynamicColumns.push({ th, index, columnCells });
    });

    // Paso 2: Medir todas las dinámicas (la lectura de scrollWidth fuerza
    // el reflow, así que las mediciones reflejan el reset anterior).
    const measurements = dynamicColumns.map(({ th, index, columnCells }) => {
        const headerWidth = getHeaderRequiredWidth(th);

        const bodyCells = tableEl.querySelectorAll(
            `tbody tr > *:nth-child(${index + 1})`
        );

        let maxContentWidth = 0;
        let maxSelectorFloor = 0;
        bodyCells.forEach((cell) => {
            const w = getCellContentWidth(cell);
            if (w > maxContentWidth) maxContentWidth = w;

            const floor = getSelectorWidgetFloor(cell);
            if (floor > maxSelectorFloor) maxSelectorFloor = floor;
        });

        const columnSelectWidth = getColumnSelectWidth(tableEl, index);

        let historicalSelectWidth = parseInt(th.dataset.mlvSelectWidth || "0", 10) || 0;
        const candidateHistorical = Math.max(columnSelectWidth, maxSelectorFloor);
        if (candidateHistorical > historicalSelectWidth) {
            historicalSelectWidth = candidateHistorical;
            th.dataset.mlvSelectWidth = String(historicalSelectWidth);
        }

        const minWidth = Math.max(
            headerWidth,
            maxContentWidth,
            columnSelectWidth,
            maxSelectorFloor,
            historicalSelectWidth,
            140
        );

        return { th, index, columnCells, minWidth };
    });

    // Paso 3: Aplicar todas las mediciones en batch (un solo paint).
    measurements.forEach(({ th, index, minWidth }) => {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajustes sobre celdas (whitespace, tooltips)
// ─────────────────────────────────────────────────────────────────────────────
function applyCellStyles(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    tableEl.querySelectorAll("thead th").forEach((th) => {
        th.style.whiteSpace = "nowrap";
        if (isSpecialColumn(th) || getFixedWidthForColumn(th) > 0) {
            th.style.overflow = "hidden";
            th.style.textOverflow = "clip";
        } else {
            th.style.overflow = "visible";
            th.style.textOverflow = "clip";
        }
    });

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
    });
}

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
// Aplicación completa. Oculta la tabla en la PRIMERA aplicación para evitar
// el flash de columnas enormes. En aplicaciones posteriores no oculta nada.
// ─────────────────────────────────────────────────────────────────────────────
function applyModernListSizing(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const isFirstTime = tableEl.dataset.mlvReady !== "1";

    if (isFirstTime) {
        tableEl.style.visibility = "hidden";
    }

    try {
        enforceTableExpansion(tableEl);
        applyCellStyles(tableEl);
        syncColumnMinimumWidths(tableEl);
        addCellTooltips(tableEl);
    } finally {
        tableEl.dataset.mlvReady = "1";
        if (isFirstTime) {
            tableEl.style.visibility = "";
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule: un solo requestAnimationFrame
// ─────────────────────────────────────────────────────────────────────────────
function scheduleApply(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    // Ocultar inmediatamente si es primera vez (antes incluso del rAF),
    // para que el usuario nunca vea la tabla en estado "crudo".
    if (tableEl.dataset.mlvReady !== "1") {
        tableEl.style.visibility = "hidden";
    }

    requestAnimationFrame(() => applyModernListSizing(tableEl));
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch ListRenderer
// ─────────────────────────────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        onMounted(() => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) scheduleApply(tableEl);
        });

        onPatched(() => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) scheduleApply(tableEl);
        });
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Observer global con DEBOUNCE (16ms): agrupa mutations en cascada
// en una sola aplicación por tabla.
// ─────────────────────────────────────────────────────────────────────────────
let _observerTimeout = null;
const _pendingTables = new Set();

function _flushPending() {
    for (const t of _pendingTables) {
        if (t.isConnected) scheduleApply(t);
    }
    _pendingTables.clear();
}

const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : [...(node.querySelectorAll?.(".o_list_table") || [])];

            for (const t of tables) _pendingTables.add(t);
        }
    }

    if (_pendingTables.size === 0) return;

    if (_observerTimeout) clearTimeout(_observerTimeout);
    _observerTimeout = setTimeout(_flushPending, 16);
});

// ─────────────────────────────────────────────────────────────────────────────
// Resize debounced
// ─────────────────────────────────────────────────────────────────────────────
let _resizeTimeout = null;
function _onResize() {
    if (_resizeTimeout) clearTimeout(_resizeTimeout);
    _resizeTimeout = setTimeout(() => {
        document.querySelectorAll("table.o_list_table").forEach((tableEl) => {
            // En resize NO queremos ocultar. Solo recalcular anchos.
            if (tableEl.dataset.mlvReady === "1" && !shouldSkipTable(tableEl)) {
                requestAnimationFrame(() => {
                    enforceTableExpansion(tableEl);
                    syncColumnMinimumWidths(tableEl);
                });
            }
        });
    }, 120);
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        _mo.observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", _onResize);
    },
    { once: true }
);