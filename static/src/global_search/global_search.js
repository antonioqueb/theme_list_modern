/** @odoo-module **/
/**
 * Búsqueda Global Inteligente — barra fija del menú principal (home).
 *
 * Arquitectura (deliberadamente ligera para NO frenar el home):
 * - Se registra como main_component: UN componente pequeño montado una sola
 *   vez con el webclient. Sin patches al core: la visibilidad la decide CSS
 *   sobre body.o_home_menu_background (la clase que web_enterprise pone
 *   mientras el menú principal está visible) — fuera del home la barra no
 *   se pinta ni participa en layout.
 * - UNA llamada RPC por búsqueda (debounce 300 ms, mínimo 2 caracteres);
 *   el backend (som.global.search) resuelve todos los modelos en un viaje.
 * - Guardia de secuencia: si llega tarde la respuesta de un término viejo,
 *   se descarta (no parpadean resultados obsoletos).
 * - Listener global de click registrado UNA vez y removido en unmount
 *   (higiene de ciclo de vida aunque el componente viva toda la sesión).
 */
import { Component, useState, useRef, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const GSB_VERSION = "19.0.21.1.0";

// Log de diagnóstico #1: el archivo llegó al bundle y se ejecutó.
console.log(`[SOM GLOBAL SEARCH] módulo cargado (v${GSB_VERSION})`);

export class SomGlobalSearchBar extends Component {
    static template = "theme_list_modern.SomGlobalSearchBar";
    static props = {};

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.rootRef = useRef("root");
        this.inputRef = useRef("input");

        this.state = useState({
            term: "",
            groups: [],
            open: false,
            loading: false,
            failed: false,
            searched: false,
            activeIndex: -1,
        });

        this._debounceTimer = null;
        this._searchSeq = 0;

        this._onDocPointerDown = (ev) => {
            if (this.rootRef.el && !this.rootRef.el.contains(ev.target)) {
                this.state.open = false;
                this.state.activeIndex = -1;
            }
        };
        document.addEventListener("pointerdown", this._onDocPointerDown, true);

        // La VISIBILIDAD la decide CSS puro: web_enterprise marca el <body>
        // con 'o_home_menu_background' mientras el menú principal está en
        // pantalla (verificado en el DOM de producción). Cero JS de
        // detección: el nodo existe siempre y el CSS lo muestra solo ahí.

        onMounted(() => {
            // Log de diagnóstico #3: el componente montó y su nodo existe.
            const el = this.rootRef.el;
            const visible = el ? getComputedStyle(el).display !== "none" : false;
            console.log(
                "[SOM GLOBAL SEARCH] montado.",
                "nodo .som-gsb en DOM:", !!el,
                "| visible ahora:", visible,
                "| body.o_home_menu_background:",
                document.body.classList.contains("o_home_menu_background")
            );
        });

        onWillUnmount(() => {
            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            document.removeEventListener("pointerdown", this._onDocPointerDown, true);
        });
    }

    // ------------------------------------------------------------------
    // Datos derivados
    // ------------------------------------------------------------------

    /** Renglones aplanados en orden visual, para navegar con teclado. */
    get flatRows() {
        const rows = [];
        for (const group of this.state.groups) {
            for (const record of group.records) {
                rows.push({ model: group.model, id: record.id });
            }
        }
        return rows;
    }

    /** Índice plano de un renglón concreto (para pintar el activo). */
    rowIndex(model, recordId) {
        return this.flatRows.findIndex(
            (row) => row.model === model && row.id === recordId
        );
    }

    get totalCount() {
        return this.state.groups.reduce(
            (sum, group) => sum + group.records.length, 0
        );
    }

    // ------------------------------------------------------------------
    // Búsqueda
    // ------------------------------------------------------------------

    onInput(ev) {
        this.state.term = ev.target.value;
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        const term = this.state.term.trim();
        if (term.length < MIN_CHARS) {
            this.state.groups = [];
            this.state.open = term.length > 0;
            this.state.searched = false;
            this.state.activeIndex = -1;
            return;
        }
        this._debounceTimer = setTimeout(() => this._runSearch(term), DEBOUNCE_MS);
    }

    async _runSearch(term) {
        const seq = ++this._searchSeq;
        this.state.loading = true;
        this.state.failed = false;
        this.state.open = true;
        try {
            const groups = await this.orm.call(
                "som.global.search", "search_everything", [term]
            );
            if (seq !== this._searchSeq) {
                return; // Respuesta obsoleta: llegó después de otra búsqueda.
            }
            this.state.groups = groups;
            this.state.searched = true;
            this.state.activeIndex = groups.length ? 0 : -1;
        } catch (error) {
            if (seq === this._searchSeq) {
                this.state.groups = [];
                this.state.failed = true;
                this.state.searched = true;
            }
            console.warn("[GLOBAL SEARCH]", error);
        } finally {
            if (seq === this._searchSeq) {
                this.state.loading = false;
            }
        }
    }

    onFocus() {
        if (this.state.term.trim().length >= MIN_CHARS && this.state.groups.length) {
            this.state.open = true;
        }
    }

    clear() {
        this.state.term = "";
        this.state.groups = [];
        this.state.open = false;
        this.state.searched = false;
        this.state.activeIndex = -1;
        if (this.inputRef.el) {
            this.inputRef.el.focus();
        }
    }

    // ------------------------------------------------------------------
    // Teclado: ↑/↓ navegan, Enter abre, Esc cierra
    // ------------------------------------------------------------------

    onKeydown(ev) {
        if (ev.key === "Escape") {
            if (this.state.open) {
                this.state.open = false;
            } else {
                this.clear();
            }
            return;
        }
        if (!this.state.open || !this.flatRows.length) {
            return;
        }
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            this.state.activeIndex =
                (this.state.activeIndex + 1) % this.flatRows.length;
            this._scrollActiveIntoView();
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.state.activeIndex =
                (this.state.activeIndex - 1 + this.flatRows.length) %
                this.flatRows.length;
            this._scrollActiveIntoView();
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            const row = this.flatRows[this.state.activeIndex] || this.flatRows[0];
            if (row) {
                this.openRecord(row.model, row.id);
            }
        }
    }

    _scrollActiveIntoView() {
        // Tras el render: desplazar el renglón activo a la vista.
        requestAnimationFrame(() => {
            const el = this.rootRef.el?.querySelector(".som-gsb-row.active");
            if (el) {
                el.scrollIntoView({ block: "nearest" });
            }
        });
    }

    // ------------------------------------------------------------------
    // Navegación
    // ------------------------------------------------------------------

    openRecord(model, recordId) {
        this.state.open = false;
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: model,
            res_id: recordId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    openGroup(group) {
        this.state.open = false;
        this.action.doAction({
            type: "ir.actions.act_window",
            name: group.label,
            res_model: group.model,
            domain: group.domain,
            views: [[false, "list"], [false, "form"]],
            target: "current",
        });
    }
}

registry.category("main_components").add("SomGlobalSearchBar", {
    Component: SomGlobalSearchBar,
});

// Log de diagnóstico #2: quedó registrado como main_component.
console.log(
    "[SOM GLOBAL SEARCH] registrado en main_components:",
    registry.category("main_components").contains("SomGlobalSearchBar")
);
