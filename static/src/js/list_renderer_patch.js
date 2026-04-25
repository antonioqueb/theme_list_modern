/**
 * Custom List Column Width - Odoo 19
 * Alphaqueb Consulting SAS
 *
 * Versión simplificada.
 *
 * Esta versión NO calcula anchos automáticamente.
 * Esta versión NO mide contenido de celdas.
 * Esta versión NO fuerza widths dinámicos en cada render.
 *
 * Único objetivo JS:
 *   - Detectar cuando el usuario redimensiona una columna.
 *   - Guardar ese ancho en localStorage.
 *   - Restaurarlo al volver a cargar la vista.
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

patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const renderer = this;

        let tableEl = null;
        let storageKey = null;
        let pointerState = null;
        let persistTimer = null;

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

                tableEl.addEventListener("pointerdown", onPointerDown, true);
            }

            requestAnimationFrame(() => {
                if (tableEl && storageKey) {
                    applyStoredWidths(tableEl, storageKey);
                }
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