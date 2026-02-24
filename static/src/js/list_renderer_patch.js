/**
 * Modern List View Theme - ListRenderer Patch
 * Alphaqueb Consulting SAS
 *
 * Extiende el ListRenderer de Odoo 19 para:
 *  1. Auto-expandir todas las columnas para mostrar el nombre completo del header
 *  2. Sincronizar anchos de columna con el contenido del header
 *  3. Añadir clase `.mlv-active` al montar para activar transiciones
 *  4. Tooltips en celdas truncadas
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched, useRef } from "@odoo/owl";

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Mide el ancho natural de un texto en una fuente/tamaño específico.
 * Usa un canvas offscreen para no afectar el DOM.
 */
const _canvas = document.createElement("canvas");
const _ctx = _canvas.getContext("2d");

function measureText(text, font = "650 0.72rem/1 'DM Sans', system-ui, sans-serif") {
    _ctx.font = font;
    return _ctx.measureText(text).width;
}

/**
 * Asegura que el th tenga al menos el ancho necesario para mostrar
 * el texto completo del header sin corte.
 */
function expandHeaders(tableEl) {
    if (!tableEl) return;

    const ths = tableEl.querySelectorAll("thead th");
    ths.forEach((th) => {
        // Obtener el texto visible del header
        const titleEl = th.querySelector(
            ".o_list_column_title, .o_column_title, span, div"
        );
        const text = titleEl ? titleEl.textContent.trim() : th.textContent.trim();
        if (!text) return;

        // Ancho del texto + padding + separador + posible sort icon
        const textWidth = measureText(text.toUpperCase()); // uppercase por CSS
        const paddingH = 14 * 2; // --mlv-cell-px * 2
        const extras = 24; // sort icon + separador
        const minWidth = Math.ceil(textWidth * 1.15 + paddingH + extras); // 1.15 = factor letter-spacing

        // Solo expandir, nunca reducir
        const current = th.offsetWidth;
        if (minWidth > current) {
            th.style.minWidth = `${minWidth}px`;
        }

        // No permitir que el header se corte
        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
    });
}

/**
 * Añade tooltip nativo a celdas truncadas.
 */
function addCellTooltips(tableEl) {
    if (!tableEl) return;

    const cells = tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)");
    cells.forEach((td) => {
        if (td._mlvTooltipBound) return;
        td._mlvTooltipBound = true;

        td.addEventListener("mouseenter", () => {
            if (td.scrollWidth > td.clientWidth + 2) {
                td.setAttribute("title", td.textContent.trim());
            } else {
                td.removeAttribute("title");
            }
        });
    });
}

/**
 * Añade clase de activación al renderer para permitir transiciones CSS.
 */
function activateRenderer(el) {
    if (!el) return;
    requestAnimationFrame(() => {
        el.classList.add("mlv-active");
    });
}

// ─── Patch al ListRenderer ────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        // Ref al elemento raíz del renderer
        this.mlvTableRef = useRef("table");
        this.mlvRootRef = useRef("root");

        const applyEnhancements = () => {
            const tableEl = this.mlvTableRef?.el || this.el?.querySelector("table.o_list_table");
            const rootEl = this.mlvRootRef?.el || this.el;

            if (tableEl) {
                expandHeaders(tableEl);
                addCellTooltips(tableEl);
            }
            if (rootEl) {
                activateRenderer(rootEl);
            }
        };

        onMounted(() => {
            applyEnhancements();
        });

        onPatched(() => {
            // Pequeño delay para que OWL termine el render del DOM
            setTimeout(applyEnhancements, 0);
        });
    },
});

// ─── ResizeObserver global para tablas de lista ───────────────────────────────
// Cuando el viewport cambia, re-aplicar anchos mínimos
const _listObserver = new ResizeObserver(() => {
    document.querySelectorAll(".o_list_table").forEach(expandHeaders);
});

// Observar el body para capturar cualquier tabla que aparezca
const _mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : node.querySelectorAll?.(".o_list_table") || [];

            tables.forEach((table) => {
                expandHeaders(table);
                addCellTooltips(table);
                _listObserver.observe(table.closest(".o_list_view") || table);
            });
        });
    });
});

// Iniciar observación cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
    _mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });
}, { once: true });
