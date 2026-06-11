/**
 * Custom List Column Width - Odoo 19
 * Alphaqueb Consulting SAS
 *
 * Objetivos JS:
 *   - Auto-ajuste inteligente: columnas compactas (boolean, números, fechas,
 *     selección) reciben solo el ancho que su contenido necesita; las columnas
 *     de texto siguen siendo flexibles y absorben el espacio sobrante.
 *   - Si el título del encabezado es más ancho que el contenido de la columna,
 *     el título se envuelve en dos líneas en vez de inflar la columna.
 *   - La medición usa canvas (sin reflow), se ejecuta una sola vez por carga
 *     de datos y se aplica antes del paint: no hay parpadeo.
 *   - Detectar cuando el usuario redimensiona una columna, guardar ese ancho
 *     en localStorage y restaurarlo al volver a cargar la vista. Los anchos
 *     manuales siempre tienen prioridad sobre el auto-ajuste.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";

const STORAGE_PREFIX = "alphaqueb:list_column_widths:v2";
const MIN_WIDTH = 48;
const MAX_WIDTH = 1400;
const RESIZE_EDGE_TOLERANCE = 12;

function shouldSkipTable(tableEl) {
    if (!tableEl) return true;

    return !!tableEl.closest(
        ".o_account_report_scroll_container, " +
        ".o_account_reports_page, " +
        ".o_account_report, " +
        ".o_account_financial_report, " +
        ".o_account_report_line, " +
        "[class*='account_report'], " +
        ".o_report_layout, " +
        ".o_settings_container, " +
        ".o_setting_container, " +
        ".app_settings_block"
    );
}

function getHeaderCells(tableEl) {
    if (!tableEl) return [];
    const row = tableEl.querySelector("thead tr");
    return row ? [...row.children] : [];
}

function getColumnName(th) {
    if (!th) return "";
    return th.getAttribute("data-name") || th.getAttribute("name") || "";
}

function isTechnicalColumn(th) {
    if (!th) return true;

    const name = getColumnName(th);

    return (
        !name ||
        name === "is_stone_expanded" ||
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box") ||
        th.classList.contains("o_list_optional_columns_dropdown") ||
        th.classList.contains("o_handle_cell") ||
        th.classList.contains("o_row_handle") ||
        th.classList.contains("o_list_button") ||
        th.classList.contains("o_list_action") ||
        th.classList.contains("o_list_record_remove") ||
        th.classList.contains("o_field_handle") ||
        th.classList.contains("o_stone_toggle_column")
    );
}

function getDbName() {
    return (
        globalThis.odoo?.session_info?.db ||
        globalThis.odoo?.session_info?.dbname ||
        "unknown_db"
    );
}

function getRendererModel(renderer) {
    return (
        renderer.props?.list?.resModel ||
        renderer.props?.list?.model?.config?.resModel ||
        renderer.props?.list?.model?.root?.resModel ||
        renderer.env?.searchModel?.resModel ||
        "unknown_model"
    );
}

function getRendererViewId(renderer) {
    return (
        renderer.props?.archInfo?.viewId ||
        renderer.props?.archInfo?.view_id ||
        renderer.props?.list?.viewId ||
        renderer.env?.config?.viewId ||
        "default_view"
    );
}

function getStorageKey(renderer) {
    const db = getDbName();
    const model = getRendererModel(renderer);
    const viewId = getRendererViewId(renderer);

    return `${STORAGE_PREFIX}:${db}:${model}:${viewId}`;
}

function loadWidths(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveWidths(key, widths) {
    try {
        localStorage.setItem(key, JSON.stringify(widths || {}));
    } catch {
        // Evitar romper Odoo si el navegador bloquea localStorage.
    }
}

function normalizeWidth(width) {
    const value = Math.round(Number(width || 0));
    if (!value || Number.isNaN(value)) return 0;
    if (value < MIN_WIDTH) return 0;
    if (value > MAX_WIDTH) return MAX_WIDTH;
    return value;
}

function collectCurrentWidths(tableEl) {
    const widths = {};

    getHeaderCells(tableEl).forEach((th) => {
        if (isTechnicalColumn(th)) return;

        const name = getColumnName(th);
        const width = normalizeWidth(th.getBoundingClientRect().width);

        if (name && width) {
            widths[name] = width;
        }
    });

    return widths;
}

function applyWidthToHeader(tableEl, columnIndex, width) {
    const safeWidth = normalizeWidth(width);
    if (!safeWidth) return;

    const th = getHeaderCells(tableEl)[columnIndex];
    if (!th || isTechnicalColumn(th)) return;

    th.style.width = `${safeWidth}px`;
    th.style.minWidth = `${safeWidth}px`;
    th.style.maxWidth = "none";

    const col = tableEl.querySelector(`colgroup col:nth-child(${columnIndex + 1})`);
    if (col) {
        col.style.width = `${safeWidth}px`;
        col.style.minWidth = `${safeWidth}px`;
        col.style.maxWidth = "none";
    }
}

function applyStoredWidths(tableEl, key) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const widths = loadWidths(key);
    if (!widths || !Object.keys(widths).length) return;

    getHeaderCells(tableEl).forEach((th, index) => {
        const name = getColumnName(th);
        if (!name || isTechnicalColumn(th)) return;

        const width = widths[name];
        if (width) {
            applyWidthToHeader(tableEl, index, width);
        }
    });
}

function persistCurrentWidths(tableEl, key) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const previous = loadWidths(key);
    const current = collectCurrentWidths(tableEl);

    saveWidths(key, {
        ...previous,
        ...current,
    });
}

function isNearRightEdge(ev, th) {
    if (!ev || !th) return false;

    const rect = th.getBoundingClientRect();
    return Math.abs(ev.clientX - rect.right) <= RESIZE_EDGE_TOLERANCE;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Auto-ajuste inteligente de anchos
   ───────────────────────────────────────────────────────────────────────────── */

// Límites por tipo de campo. `extra` es el padding/iconos que se suma al texto
// medido. Los tipos compactos además quedan con max-width fijo para que el
// espacio sobrante de la tabla se vaya a las columnas flexibles.
const TYPE_BOUNDS = {
    boolean: { min: 60, max: 96, extra: 16 },
    integer: { min: 70, max: 130, extra: 26 },
    float: { min: 80, max: 150, extra: 26 },
    monetary: { min: 90, max: 170, extra: 30 },
    date: { min: 92, max: 130, extra: 26 },
    datetime: { min: 125, max: 175, extra: 26 },
    selection: { min: 85, max: 220, extra: 38 },
    char: { min: 95, max: 340, extra: 30 },
    many2one: { min: 105, max: 340, extra: 30 },
    many2many: { min: 105, max: 360, extra: 44 },
    one2many: { min: 105, max: 360, extra: 44 },
    text: { min: 160, max: 560, extra: 30 },
    html: { min: 160, max: 560, extra: 30 },
    default: { min: 90, max: 300, extra: 30 },
};

// Tipos cuyo ancho NO se congela: pueden crecer para absorber espacio sobrante.
const FLEX_TYPES = new Set([
    "char",
    "text",
    "html",
    "many2one",
    "many2many",
    "one2many",
    "reference",
    "default",
]);

const MAX_MEASURED_ROWS = 60;
const HEADER_SORT_ICON_SPACE = 38;
const HEADER_WORD_PADDING = 26;

let measureCtx = null;

function getMeasureContext() {
    if (!measureCtx) {
        measureCtx = document.createElement("canvas").getContext("2d");
    }
    return measureCtx;
}

function textWidth(text, font) {
    if (!text) return 0;
    const ctx = getMeasureContext();
    ctx.font = font;
    return ctx.measureText(text).width;
}

function cssFont(el) {
    const s = window.getComputedStyle(el);
    return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
}

function getColumnTypes(renderer) {
    const map = {};

    const fields =
        renderer.props?.list?.fields ||
        renderer.props?.list?.model?.root?.fields ||
        {};

    const columns = renderer.props?.archInfo?.columns || [];

    columns.forEach((col) => {
        if (col?.type !== "field" || !col.name) return;

        let type = fields[col.name]?.type || "";

        // Algunos widgets cambian la naturaleza visual del campo.
        if (col.widget === "badge") type = "selection";
        if (col.widget === "boolean_toggle" || col.widget === "boolean_favorite") {
            type = "boolean";
        }
        if (col.widget === "monetary") type = "monetary";

        map[col.name] = type;
    });

    return map;
}

// Fallback cuando no podemos resolver el tipo desde el modelo.
function inferTypeFromCells(cells) {
    for (const td of cells) {
        if (!td) continue;
        if (td.querySelector("input[type='checkbox'], .o-checkbox")) {
            return "boolean";
        }
        if (td.classList.contains("o_list_number")) {
            return "float";
        }
    }
    return "default";
}

function applyAutoWidth(tableEl, columnIndex, width, freeze) {
    const th = getHeaderCells(tableEl)[columnIndex];
    if (!th || isTechnicalColumn(th)) return;

    th.style.width = `${width}px`;
    th.style.minWidth = `${width}px`;
    th.style.maxWidth = freeze ? `${width}px` : "none";

    const col = tableEl.querySelector(`colgroup col:nth-child(${columnIndex + 1})`);
    if (col) {
        col.style.width = `${width}px`;
        col.style.minWidth = `${width}px`;
        col.style.maxWidth = freeze ? `${width}px` : "none";
    }
}

function autoFitColumns(tableEl, renderer, storedWidths) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerCells = getHeaderCells(tableEl);
    if (!headerCells.length) return;

    const bodyRows = [...tableEl.querySelectorAll("tbody tr.o_data_row")].slice(
        0,
        MAX_MEASURED_ROWS
    );

    const columnTypes = getColumnTypes(renderer);

    const sampleTd = tableEl.querySelector("tbody td.o_data_cell");
    const cellFont = sampleTd ? cssFont(sampleTd) : cssFont(tableEl);
    const sampleTh = headerCells.find((th) => !isTechnicalColumn(th));
    const headerFont = sampleTh ? cssFont(sampleTh) : cellFont;

    headerCells.forEach((th, index) => {
        if (isTechnicalColumn(th)) return;

        const name = getColumnName(th);
        if (!name) return;

        // Un ancho redimensionado por el usuario manda sobre el auto-ajuste.
        if (storedWidths && storedWidths[name]) return;

        const cells = bodyRows.map((row) => row.children[index]);
        const type = columnTypes[name] || inferTypeFromCells(cells);
        const bounds = TYPE_BOUNDS[type] || TYPE_BOUNDS.default;

        // Ancho real del contenido (texto más largo de la columna).
        let contentWidth = 0;
        for (const td of cells) {
            if (!td) continue;
            const text = (td.textContent || "").trim();
            if (text) {
                contentWidth = Math.max(contentWidth, textWidth(text, cellFont));
            }
        }
        contentWidth += bounds.extra;

        // Ancho del encabezado: completo en una línea y su palabra más larga.
        const headerText = (th.textContent || "").trim();
        const headerFullWidth =
            textWidth(headerText, headerFont) + HEADER_SORT_ICON_SPACE;
        const longestWord = headerText
            .split(/\s+/)
            .reduce((a, b) => (b.length > a.length ? b : a), "");
        const headerWordWidth =
            textWidth(longestWord, headerFont) + HEADER_WORD_PADDING;

        let width;
        let wrapHeader = false;

        if (headerFullWidth <= Math.max(contentWidth, bounds.min)) {
            // El título cabe en el ancho que pide el contenido.
            width = Math.max(contentWidth, bounds.min);
        } else {
            // Título más ancho que el contenido: ajustar al contenido y
            // permitir que el título se envuelva en dos líneas.
            width = Math.max(contentWidth, headerWordWidth, bounds.min);
            wrapHeader = width < headerFullWidth;
        }

        width = Math.round(Math.min(width, bounds.max));
        wrapHeader = wrapHeader && width < headerFullWidth;

        th.classList.toggle("aq_th_wrap", wrapHeader);

        applyAutoWidth(tableEl, index, width, !FLEX_TYPES.has(type));
    });
}

function getAutoFitSignature(tableEl) {
    const names = getHeaderCells(tableEl)
        .map((th) => getColumnName(th))
        .filter(Boolean)
        .join("|");
    const hasRows = tableEl.querySelector("tbody tr.o_data_row") ? "1" : "0";
    return `${names}::${hasRows}`;
}

patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const renderer = this;

        let tableEl = null;
        let storageKey = null;
        let pointerState = null;
        let persistTimer = null;
        let lastAutoFitSignature = null;

        const schedulePersist = () => {
            if (persistTimer) {
                clearTimeout(persistTimer);
            }

            persistTimer = setTimeout(() => {
                if (tableEl && storageKey) {
                    persistCurrentWidths(tableEl, storageKey);
                }
            }, 180);
        };

        const onPointerDown = (ev) => {
            if (!tableEl || shouldSkipTable(tableEl)) return;

            const th = ev.target?.closest?.("thead th");
            if (!th || isTechnicalColumn(th)) return;

            if (!isNearRightEdge(ev, th)) return;

            pointerState = {
                x: ev.clientX,
                th,
            };
        };

        const onPointerUp = (ev) => {
            if (!pointerState) return;

            const moved = Math.abs((ev?.clientX || pointerState.x) - pointerState.x);
            pointerState = null;

            if (moved >= 3) {
                schedulePersist();
            }
        };

        const bindTable = () => {
            const nextTable = renderer.el?.querySelector?.("table.o_list_table");

            if (!nextTable || shouldSkipTable(nextTable)) {
                if (tableEl) {
                    tableEl.removeEventListener("pointerdown", onPointerDown, true);
                }
                tableEl = null;
                storageKey = null;
                return;
            }

            if (nextTable !== tableEl) {
                if (tableEl) {
                    tableEl.removeEventListener("pointerdown", onPointerDown, true);
                }

                tableEl = nextTable;
                storageKey = getStorageKey(renderer);
                lastAutoFitSignature = null;

                tableEl.addEventListener("pointerdown", onPointerDown, true);
            }

            requestAnimationFrame(() => {
                if (!tableEl || !storageKey) return;

                // Auto-ajuste: solo cuando cambian las columnas o llegan datos,
                // para no recalcular (ni mover nada) en cada render.
                const signature = getAutoFitSignature(tableEl);
                if (signature !== lastAutoFitSignature) {
                    lastAutoFitSignature = signature;
                    autoFitColumns(tableEl, renderer, loadWidths(storageKey));
                }

                applyStoredWidths(tableEl, storageKey);
            });
        };

        onMounted(() => {
            bindTable();
            window.addEventListener("pointerup", onPointerUp, true);
        });

        onPatched(() => {
            bindTable();
        });

        onWillUnmount(() => {
            if (persistTimer) {
                clearTimeout(persistTimer);
            }

            if (tableEl) {
                tableEl.removeEventListener("pointerdown", onPointerDown, true);
            }

            window.removeEventListener("pointerup", onPointerUp, true);
        });
    },
});

/**
 * Utilidad manual desde consola del navegador:
 *
 *     alphaquebClearListColumnWidths()
 *
 * Sirve para limpiar anchos guardados si una vista queda con una configuración vieja.
 */
globalThis.alphaquebClearListColumnWidths = function alphaquebClearListColumnWidths() {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
            keys.push(key);
        }
    }

    keys.forEach((key) => localStorage.removeItem(key));

    return keys.length;
};