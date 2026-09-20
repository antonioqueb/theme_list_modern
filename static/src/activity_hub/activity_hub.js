/** @odoo-module **/
/**
 * Centro de Actividades SOM — client action.
 *
 * Un solo RPC (`som.activity.hub.get_data`) trae pendientes, mis
 * solicitudes, historial y el catálogo con las preferencias del usuario.
 * Se refresca solo cuando el bus avisa de cambios en actividades
 * (`mail.activity/updated`) con un debounce corto; cualquier acción del
 * usuario (atender, cambiar preferencia) vuelve a cargar.
 */
import { Component, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const REFRESH_DEBOUNCE_MS = 900;

export function somFmtDate(iso) {
    if (!iso) {
        return "";
    }
    const [datePart, timePart] = String(iso).split(" ");
    const [y, m, d] = datePart.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) {
        return iso;
    }
    const base = `${d} ${MONTHS[m - 1]} ${y}`;
    return timePart ? `${base} ${timePart}` : base;
}

export class SomActivityHub extends Component {
    static template = "theme_list_modern.SomActivityHub";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.busService = useService("bus_service");

        this.state = useState({
            loading: true,
            failed: false,
            tab: "pending",
            data: null,
            category: "all",
            search: "",
            feedbackFor: null,
            feedbackText: "",
            busy: {},
            historyLimit: 40,
        });

        this._refreshTimer = null;
        this._onBus = () => this.scheduleRefresh();
        this.busService.subscribe("mail.activity/updated", this._onBus);

        onWillStart(() => this.load());
        onWillUnmount(() => {
            this.busService.unsubscribe("mail.activity/updated", this._onBus);
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
            }
        });
    }

    // ------------------------------------------------------------------
    // Carga
    // ------------------------------------------------------------------
    async load() {
        this.state.loading = true;
        this.state.failed = false;
        try {
            this.state.data = await this.orm.call("som.activity.hub", "get_data", []);
        } catch (e) {
            console.error("[SOM ACTIVITY HUB] fallo al cargar", e);
            this.state.failed = true;
        } finally {
            this.state.loading = false;
        }
    }

    scheduleRefresh() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = null;
            this.load();
        }, REFRESH_DEBOUNCE_MS);
    }

    // ------------------------------------------------------------------
    // Derivados
    // ------------------------------------------------------------------
    get data() {
        return this.state.data || { pending: [], history: [], requests: [], kinds: [], categories: [], hidden_pending: 0 };
    }

    get pendingCount() {
        return this.data.pending.length;
    }

    get overdueCount() {
        return this.data.pending.filter((a) => a.state === "overdue").length;
    }

    get openRequestsCount() {
        return this.data.requests.filter((r) => r.status === "open").length;
    }

    get categoriesWithCounts() {
        const counts = {};
        for (const a of this.data.pending) {
            const c = a.kind ? a.kind.category : "sistema";
            counts[c] = (counts[c] || 0) + 1;
        }
        return this.data.categories
            .map((c) => ({ ...c, count: counts[c.key] || 0 }))
            .filter((c) => c.count > 0);
    }

    matchesSearch(text) {
        const term = this.state.search.trim().toLowerCase();
        if (!term) {
            return true;
        }
        return (text || "").toLowerCase().includes(term);
    }

    get filteredPending() {
        return this.data.pending.filter((a) => {
            if (this.state.category !== "all" && (a.kind ? a.kind.category : "sistema") !== this.state.category) {
                return false;
            }
            return this.matchesSearch(`${a.summary} ${a.res_name} ${a.note} ${a.requester} ${a.kind ? a.kind.name : ""}`);
        });
    }

    /** Pendientes agrupadas por tipo, en el orden del catálogo. */
    get pendingGroups() {
        const groups = new Map();
        for (const a of this.filteredPending) {
            const key = a.kind ? a.kind.id : 0;
            if (!groups.has(key)) {
                groups.set(key, { kind: a.kind, items: [] });
            }
            groups.get(key).items.push(a);
        }
        return [...groups.values()];
    }

    get filteredRequests() {
        return this.data.requests.filter((r) =>
            this.matchesSearch(`${r.summary} ${r.res_name} ${r.waiting_on.join(" ")} ${r.resolved_by}`)
        );
    }

    get filteredHistory() {
        return this.data.history
            .filter((a) => this.matchesSearch(`${a.summary} ${a.res_name} ${a.feedback} ${a.closed_by}`))
            .slice(0, this.state.historyLimit);
    }

    get kindsByCategory() {
        const out = [];
        for (const c of this.data.categories) {
            const kinds = this.data.kinds.filter((k) => k.category === c.key);
            if (kinds.length) {
                out.push({ ...c, kinds });
            }
        }
        return out;
    }

    get enabledKindsCount() {
        return this.data.kinds.filter((k) => k.enabled).length;
    }

    fmtDate(iso) {
        return somFmtDate(iso);
    }

    daysLabel(n) {
        if (n <= 0) {
            return "hoy";
        }
        return n === 1 ? "hace 1 día" : `hace ${n} días`;
    }

    stateLabel(a) {
        if (a.state === "overdue") {
            return a.days_late === 1 ? "Vencida hace 1 día" : `Vencida hace ${a.days_late} días`;
        }
        if (a.state === "today") {
            return "Vence hoy";
        }
        return `Vence ${this.fmtDate(a.deadline)}`;
    }

    // ------------------------------------------------------------------
    // Acciones
    // ------------------------------------------------------------------
    setTab(tab) {
        this.state.tab = tab;
        this.state.feedbackFor = null;
        this.state.search = "";
    }

    setCategory(key) {
        this.state.category = key;
    }

    onSearch(ev) {
        this.state.search = ev.target.value;
    }

    openRecord(resModel, resId) {
        if (!resModel || !resId) {
            return;
        }
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: resModel,
            res_id: resId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    toggleFeedback(activity) {
        if (this.state.feedbackFor === activity.id) {
            this.state.feedbackFor = null;
            this.state.feedbackText = "";
        } else {
            this.state.feedbackFor = activity.id;
            this.state.feedbackText = "";
        }
    }

    onFeedbackInput(ev) {
        this.state.feedbackText = ev.target.value;
    }

    async markDone(activity, withFeedback = false) {
        if (this.state.busy[activity.id]) {
            return;
        }
        this.state.busy[activity.id] = true;
        try {
            const feedback = withFeedback ? this.state.feedbackText : "";
            await this.orm.call("som.activity.hub", "mark_done", [[activity.id], feedback]);
            this.notification.add(
                activity.kind && activity.kind.shared
                    ? "Atendida. Las de los demás asignados se cerraron solas."
                    : "Actividad atendida.",
                { type: "success" }
            );
            this.state.feedbackFor = null;
            this.state.feedbackText = "";
            await this.load();
        } catch (e) {
            console.error("[SOM ACTIVITY HUB] no se pudo atender", e);
            this.notification.add("No se pudo atender la actividad. Intenta de nuevo.", { type: "danger" });
        } finally {
            delete this.state.busy[activity.id];
        }
    }

    async togglePref(kind) {
        const enabled = !kind.enabled;
        kind.enabled = enabled; // optimista
        try {
            await this.orm.call("som.activity.hub", "set_pref", [kind.id, enabled]);
            await this.load();
        } catch (e) {
            kind.enabled = !enabled;
            console.error("[SOM ACTIVITY HUB] no se pudo guardar la preferencia", e);
            this.notification.add("No se pudo guardar la preferencia.", { type: "danger" });
        }
    }

    async setAllPrefs(enabled) {
        try {
            await this.orm.call("som.activity.hub", "set_all_prefs", [enabled]);
            await this.load();
        } catch (e) {
            console.error("[SOM ACTIVITY HUB] no se pudo guardar las preferencias", e);
            this.notification.add("No se pudieron guardar las preferencias.", { type: "danger" });
        }
    }

    showMoreHistory() {
        this.state.historyLimit += 40;
    }
}

registry.category("actions").add("theme_list_modern.activity_hub", SomActivityHub);
