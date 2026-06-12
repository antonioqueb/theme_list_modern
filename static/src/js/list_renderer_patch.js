/**
 * Custom List Column Width - Odoo 19
 * Alphaqueb Consulting SAS
 *
 * Regla principal:
 *   TODAS las columnas deben caber siempre en el ancho visible de la pantalla.
 *   No hay scroll horizontal: si la suma de anchos ideales excede el contenedor,
 *   las columnas se encogen (primero las flexibles, luego todas) hasta caber.
 *
 * Cómo funciona:
 *   1. Se calcula un ancho ideal por columna según el tipo de campo y el
 *      contenido real de las celdas (medición con canvas, sin reflow).
 *   2. Se ajusta el total al ancho del contenedor: el espacio sobrante se
 *      reparte solo entre columnas de texto; el faltante se recorta primero
 *      de las flexibles y después de todas proporcionalmente.
 *   3. Se aplica con table-layout: fixed para que el navegador respete los
 *      anchos exactos y el contenido largo se trunque en vez de desbordar.
 *   4. Si el título del encabezado no cabe, se envuelve en dos líneas en vez
 *      de inflar la columna.
 *
 * Los anchos redimensionados manualmente por el usuario se guardan en
 * localStorage y se usan como ancho ideal de esa columna, pero también
 * participan del ajuste: la regla de "todo cabe en pantalla" manda.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched, onWillUnmount } from "@odoo/owl";

const STORAGE_BASE_PREFIX = "alphaqueb:list_column_widths";
const STORAGE_PREFIX = `${STORAGE_BASE_PREFIX}:v3`;
const MIN_WIDTH = 48;
const MAX_WIDTH = 1400;
const HARD_MIN_WIDTH = 40;
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
   Ajuste inteligente de anchos con regla "todo cabe en pantalla"
   ───────────────────────────────────────────────────────────────────────────── */

// Límites por tipo de campo. `extra` es el padding/iconos que se suma al
// texto medido.
const TYPE_BOUNDS = {
    boolean: { min: 38, max: 70, extra: 10 },
    toggle: { min: 36, max: 64, extra: 8 },
    integer: { min: 70, max: 130, extra: 26 },
    float: { min: 85, max: 155, extra: 26 },
    monetary: { min: 100, max: 180, extra: 30 },
    date: { min: 92, max: 130, extra: 26 },
    datetime: { min: 125, max: 175, extra: 26 },
    selection: { min: 85, max: 220, extra: 38 },
    char: { min: 95, max: 340, extra: 30 },
    many2one: { min: 105, max: 340, extra: 30 },
    many2many: { min: 96, max: 280, extra: 34 },
    one2many: { min: 105, max: 360, extra: 44 },
    text: { min: 160, max: 560, extra: 30 },
    html: { min: 160, max: 560, extra: 30 },
    default: { min: 90, max: 300, extra: 30 },
};

// Tipos que ceden espacio primero cuando la tabla no cabe.
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

// El espacio sobrante lo absorbe UNA sola columna: la principal (producto /
// nombre). Se busca por nombre de campo en este orden; si la vista no tiene
// ninguno, se usa la columna de texto más ancha como respaldo.
const MAIN_GROW_FIELDS = [
    "product_template_id",
    "product_id",
    "name",
    "display_name",
];

const GROW_TYPES = new Set(["char", "text", "html", "many2one"]);

const MAX_MEASURED_ROWS = 60;
const HEADER_SORT_ICON_SPACE = 38;
const HEADER_WORD_PADDING = 26;
// Booleanos/toggles: encabezado compacto (menos padding lateral, ver CSS
// .aq_th_compact), por eso reservan menos espacio extra para la palabra.
const COMPACT_WORD_PADDING = 14;
const COMPACT_TYPES = new Set(["boolean", "toggle"]);

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
            type = "toggle";
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
        if (td.querySelector(".o_boolean_toggle, .form-switch")) {
            return "toggle";
        }
        if (td.querySelector("input[type='checkbox'], .o-checkbox")) {
            return "boolean";
        }
        if (td.classList.contains("o_list_number")) {
            return "float";
        }
    }
    return "default";
}

function getContainerWidth(tableEl) {
    const container =
        tableEl.closest(".o_list_renderer") || tableEl.parentElement;
    return container ? container.clientWidth : 0;
}

// Recorta `amount` px de las columnas, proporcional al margen que cada una
// tiene sobre su mínimo. Devuelve lo que no se pudo recortar.
function shrinkColumns(cols, amount) {
    if (amount <= 0 || !cols.length) return Math.max(0, amount);

    const slackTotal = cols.reduce(
        (sum, c) => sum + Math.max(0, c.width - c.min),
        0
    );
    if (slackTotal <= 0) return amount;

    const ratio = Math.min(1, amount / slackTotal);
    let removed = 0;

    cols.forEach((c) => {
        const slack = Math.max(0, c.width - c.min);
        const cut = slack * ratio;
        c.width -= cut;
        removed += cut;
    });

    return Math.max(0, amount - removed);
}

function setColumnWidth(tableEl, columnIndex, width) {
    const px = `${Math.round(width)}px`;

    const th = getHeaderCells(tableEl)[columnIndex];
    if (th) {
        th.style.width = px;
        th.style.minWidth = "";
        th.style.maxWidth = "";
    }

    const col = tableEl.querySelector(
        `colgroup col:nth-child(${columnIndex + 1})`
    );
    if (col) {
        col.style.width = px;
        col.style.minWidth = "";
        col.style.maxWidth = "";
    }
}

function fitColumns(tableEl, renderer, storedWidths) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerCells = getHeaderCells(tableEl);
    if (!headerCells.length) return;

    const containerWidth = getContainerWidth(tableEl);
    if (containerWidth < 120) return; // Contenedor oculto o sin layout aún.

    const bodyRows = [...tableEl.querySelectorAll("tbody tr.o_data_row")].slice(
        0,
        MAX_MEASURED_ROWS
    );

    const columnTypes = getColumnTypes(renderer);

    const sampleTd = tableEl.querySelector("tbody td.o_data_cell");
    const cellFont = sampleTd ? cssFont(sampleTd) : cssFont(tableEl);
    const sampleTh = headerCells.find((th) => !isTechnicalColumn(th));
    const headerFont = sampleTh ? cssFont(sampleTh) : cellFont;

    const dataCols = [];
    let technicalTotal = 0;

    headerCells.forEach((th, index) => {
        if (isTechnicalColumn(th)) {
            let width = Math.round(th.getBoundingClientRect().width) || 32;
            width = Math.min(Math.max(width, 24), 80);
            technicalTotal += width;
            setColumnWidth(tableEl, index, width);
            return;
        }

        const name = getColumnName(th);
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

        const compact = COMPACT_TYPES.has(type);

        // Ancho del encabezado: completo en una línea y su palabra más larga.
        const headerText = (th.textContent || "").trim();
        const headerFullWidth =
            textWidth(headerText, headerFont) + HEADER_SORT_ICON_SPACE;
        const longestWord = headerText
            .split(/\s+/)
            .reduce((a, b) => (b.length > a.length ? b : a), "");
        const headerWordWidth =
            textWidth(longestWord, headerFont) +
            (compact ? COMPACT_WORD_PADDING : HEADER_WORD_PADDING);

        let ideal;
        if (headerFullWidth <= Math.max(contentWidth, bounds.min)) {
            ideal = Math.max(contentWidth, bounds.min);
        } else {
            // Título más ancho que el contenido: ajustar al contenido y
            // dejar que el título se envuelva en dos líneas.
            ideal = Math.max(contentWidth, headerWordWidth, bounds.min);
        }
        // En booleanos/toggles el título completo manda: la palabra más
        // larga puede superar el máximo del tipo, pero nunca se corta.
        ideal = Math.min(ideal, Math.max(bounds.max, compact ? headerWordWidth : 0));

        // Un ancho guardado por el usuario reemplaza al ideal calculado,
        // pero sigue sujeto al ajuste global de "todo cabe en pantalla".
        const stored = normalizeWidth(storedWidths?.[name]);
        if (stored) {
            ideal = stored;
        }

        // Mínimo inquebrantable: en booleanos/toggles ninguna fase de
        // encogimiento puede bajar del ancho de la palabra más larga del
        // título, para que "Mandar Pedir" / "Por Asignar" se lean completos.
        const titleFloor = compact ? Math.min(ideal, headerWordWidth) : 0;

        dataCols.push({
            index,
            th,
            name,
            type,
            width: ideal,
            min: Math.min(
                ideal,
                Math.max(bounds.min, HARD_MIN_WIDTH, titleFloor)
            ),
            titleFloor,
            flexible: FLEX_TYPES.has(type),
            stored: !!stored,
            headerFullWidth,
        });
    });

    if (!dataCols.length) return;

    const available = containerWidth - technicalTotal - 4;
    const total = dataCols.reduce((sum, c) => sum + c.width, 0);

    if (total > available) {
        // No cabe: encoger primero las flexibles hasta su mínimo de tipo...
        let overflow = total - available;
        overflow = shrinkColumns(
            dataCols.filter((c) => c.flexible),
            overflow
        );

        // ...y si aún no cabe, encoger todas hasta el mínimo duro,
        // sin romper el piso del título en booleanos/toggles.
        if (overflow > 0) {
            dataCols.forEach((c) => {
                c.min = Math.min(c.width, Math.max(HARD_MIN_WIDTH, c.titleFloor));
            });
            shrinkColumns(dataCols, overflow);
        }
    } else if (total < available) {
        // Sobra espacio: lo absorbe ÚNICAMENTE la columna principal
        // (producto / nombre). El resto conserva su ancho justo.
        const candidates = dataCols.filter((c) => !c.stored);
        let grower = null;

        for (const fieldName of MAIN_GROW_FIELDS) {
            grower = candidates.find((c) => c.name === fieldName) || null;
            if (grower) break;
        }

        if (!grower) {
            // Respaldo: la columna de texto más ancha de la vista.
            grower =
                candidates
                    .filter((c) => GROW_TYPES.has(c.type))
                    .sort((a, b) => b.width - a.width)[0] || null;
        }

        if (grower) {
            grower.width += available - total;
        }
    }

    dataCols.forEach((c) => {
        const width = Math.floor(c.width);
        setColumnWidth(tableEl, c.index, width);
        c.th.classList.toggle("aq_th_wrap", width + 6 < c.headerFullWidth);
        c.th.classList.toggle("aq_th_compact", COMPACT_TYPES.has(c.type));
    });

    // table-layout fixed: el navegador respeta los anchos exactos y el
    // contenido largo se trunca en vez de desbordar la pantalla.
    tableEl.style.tableLayout = "fixed";
    tableEl.style.width = "100%";
    tableEl.style.maxWidth = "100%";
}

function getFitSignature(tableEl) {
    const names = getHeaderCells(tableEl)
        .map((th) => getColumnName(th))
        .filter(Boolean)
        .join("|");
    const hasRows = tableEl.querySelector("tbody tr.o_data_row") ? "1" : "0";
    const containerWidth = getContainerWidth(tableEl);
    return `${names}::${hasRows}::${containerWidth}`;
}

patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const renderer = this;

        let tableEl = null;
        let storageKey = null;
        let pointerState = null;
        let persistTimer = null;
        let resizeTimer = null;
        let lastFitSignature = null;

        const runFit = () => {
            if (!tableEl || !storageKey) return;

            const signature = getFitSignature(tableEl);
            if (signature === lastFitSignature) return;
            lastFitSignature = signature;

            fitColumns(tableEl, renderer, loadWidths(storageKey));
        };

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

        const onWindowResize = () => {
            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }

            resizeTimer = setTimeout(() => {
                runFit();
            }, 150);
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
                lastFitSignature = null;

                tableEl.addEventListener("pointerdown", onPointerDown, true);
            }

            requestAnimationFrame(() => {
                runFit();
            });
        };

        onMounted(() => {
            bindTable();
            window.addEventListener("pointerup", onPointerUp, true);
            window.addEventListener("resize", onWindowResize);
        });

        onPatched(() => {
            bindTable();
        });

        onWillUnmount(() => {
            if (persistTimer) {
                clearTimeout(persistTimer);
            }

            if (resizeTimer) {
                clearTimeout(resizeTimer);
            }

            if (tableEl) {
                tableEl.removeEventListener("pointerdown", onPointerDown, true);
            }

            window.removeEventListener("pointerup", onPointerUp, true);
            window.removeEventListener("resize", onWindowResize);
        });
    },
});

/**
 * Utilidad manual desde consola del navegador:
 *
 *     alphaquebClearListColumnWidths()
 *
 * Limpia todos los anchos guardados (incluye versiones anteriores del módulo).
 */
globalThis.alphaquebClearListColumnWidths = function alphaquebClearListColumnWidths() {
    const keys = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_BASE_PREFIX)) {
            keys.push(key);
        }
    }

    keys.forEach((key) => localStorage.removeItem(key));

    return keys.length;
};
