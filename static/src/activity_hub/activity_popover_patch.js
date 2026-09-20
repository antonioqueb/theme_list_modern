/** @odoo-module **/
/**
 * Popover de actividades (columna "Actividades" de listas, ícono de
 * kanban/form): oculta las actividades que viven en el Centro SOM.
 * La bandera `x_som_hub` la manda el servidor en mail.activity._to_store_defaults.
 */
import { ActivityListPopover } from "@mail/core/web/activity_list_popover";
import { patch } from "@web/core/utils/patch";

patch(ActivityListPopover.prototype, {
    get activities() {
        return super.activities.filter((activity) => !activity.x_som_hub);
    },
});
