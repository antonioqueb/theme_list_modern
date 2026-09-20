/** @odoo-module **/
/**
 * Relojito del systray vs. Centro de Actividades SOM.
 *
 * El servidor ya excluye las actividades del Centro al calcular el contador
 * (`res.users._get_activity_groups`), pero el core ajusta ese contador en
 * caliente con los deltas que llegan por el bus (`mail.activity/updated`,
 * count_diff) sin distinguir de qué tipo es la actividad: al crearse una
 * autorización el reloj subiría aunque no la muestre.
 *
 * Solución mínima: tras cualquier delta, volver a pedir el estado real del
 * systray (una llamada, con debounce). El valor del servidor manda.
 */
import { registry } from "@web/core/registry";

const DEBOUNCE_MS = 800;

const somActivitySystraySync = {
    dependencies: ["bus_service", "mail.store"],
    start(env, { bus_service, "mail.store": store }) {
        let timer = null;
        bus_service.subscribe("mail.activity/updated", () => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                timer = null;
                try {
                    store.fetchStoreData("systray_get_activities");
                } catch (e) {
                    console.warn("[SOM ACTIVITY HUB] no se pudo refrescar el systray", e);
                }
            }, DEBOUNCE_MS);
        });
    },
};

registry.category("services").add("som_activity_systray_sync", somActivitySystraySync);
