/**
 * Modern List View Theme v3.6 - Stable column width enforcement
 * Alphaqueb Consulting SAS
 *
 * v3.6:
 *  - getSelectorWidgetFloor: ahora lee style="width:Xpx" del campo desde la
 *    vista (en la celda, wrapper del widget o padre) y lo usa como piso real.
 *    Fallback generoso de 280px para widgets selector sin width explícito.
 *    Esto evita que la columna se achate al cambiar a opciones cortas como
 *    "Precio Personalizado" (que renderiza solo un <span>).
 *  - El piso del selector también se persiste en dataset.mlvSelectWidth,
 *    así la columna recuerda su ancho aunque todas las filas estén en modo
 *    sin <select>.
 *
 * v3.5:
 *  - Detección de <select> en cualquier fila de la columna.
 *  - Detección genérica de widgets con clase "*selector*" / "*__label".
 *
 * v3.4:
 *  - Medición del contenido real de cada celda (no solo del header).
 *
 * v3.3:
 *  - Respetar ancho mínimo del encabezado.
 *  - Evitar expansión de columnas técnicas.
 *  - Recalcular automáticamente al abrir la vista.
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
// Medir texto arbitrario usando un span invisible con los estilos dados
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

// ─────────────────────────────────────────────────────────────────────────────
// Calcula el ancho necesario para un <select> basado en la opción más larga
// ─────────────────────────────────────────────────────────────────────────────
function getSelectRequiredWidth(selectEl) {
    if (!selectEl) return 0;
    let maxOptionWidth = 0;
    for (let i = 0; i < selectEl.options.length; i++) {
        const optText = selectEl.options[i].textContent || "";
        const w = measureText(optText, selectEl);
        if (w > maxOptionWidth) maxOptionWidth = w;
    }
    // +40 por el arrow del select y padding interno
    return maxOptionWidth + 40;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecta si una celda contiene un widget tipo "selector" (por clases CSS)
// y devuelve el ancho mínimo sugerido:
//   1. Si la vista definió style="width:Xpx" → lo respeta + 40px de padding.
//   2. Si no hay style explícito → fallback de 280px.
//   3. Si no hay widget selector → devuelve 0.
// ─────────────────────────────────────────────────────────────────────────────
function getSelectorWidgetFloor(cell) {
    if (!cell) return 0;

    const selectorEl = cell.querySelector(
        "[class*='selector'], [class*='__label'], .o_field_selection, .o_field_radio"
    );
    if (!selectorEl) return 0;

    // Buscar ancho explícito puesto por el dev en la vista XML (style="width: 240px")
    // Puede estar en el mismo cell, en el wrapper del widget, o en el padre del campo.
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
                // +40 para padding de celda y el arrow del select
                return parseInt(match[1], 10) + 40;
            }
        }
    }

    // Fallback generoso para widgets selector sin width explícito
    return 280;
}

// ─────────────────────────────────────────────────────────────────────────────
// Medir ancho real del contenido de una celda
// ─────────────────────────────────────────────────────────────────────────────
function getCellContentWidth(cell) {
    if (!cell) return 0;

    const cellStyle = window.getComputedStyle(cell);
    const padLeft = parseFloat(cellStyle.paddingLeft || "0");
    const padRight = parseFloat(cellStyle.paddingRight || "0");

    let contentWidth = 0;

    // Caso 1: <select> directo
    const selectEl = cell.querySelector("select");
    if (selectEl) {
        contentWidth = getSelectRequiredWidth(selectEl);
    }

    // Caso 2: input de texto / número / textarea
    if (!contentWidth) {
        const inputEl = cell.querySelector("input[type='text'], input[type='number'], textarea");
        if (inputEl && inputEl.value) {
            contentWidth = measureText(inputEl.value, inputEl) + 24;
        }
    }

    // Caso 3: contenido genérico (texto, badges, tags, etc.)
    if (!contentWidth) {
        contentWidth = Math.ceil(cell.scrollWidth || 0);
    }

    return Math.ceil(contentWidth + padLeft + padRight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca un <select> en cualquier celda de una columna y devuelve su ancho
// requerido. Estabiliza columnas cuyo contenido cambia entre <select>
// (cuando se edita) y <span> corto (readonly / "custom").
// ─────────────────────────────────────────────────────────────────────────────
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

            const headerWidth = getHeaderRequiredWidth(th);

            // Medir contenido de todas las celdas de la columna
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

            // Ancho de <select> si existe en alguna fila
            const columnSelectWidth = getColumnSelectWidth(tableEl, index);

            // Persistir el ancho máximo histórico (del select O del selector floor)
            // para que al cambiar a "custom" / readonly la columna no se achate.
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
    setTimeout(run, 600);
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