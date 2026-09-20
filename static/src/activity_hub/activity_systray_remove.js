/** @odoo-module **/
/**
 * El relojito de actividades del systray desaparece: TODAS las actividades
 * (SOM y manuales) viven únicamente en el Centro de Actividades.
 */
import { registry } from "@web/core/registry";

const systray = registry.category("systray");
if (systray.contains("mail.activity_menu")) {
    systray.remove("mail.activity_menu");
}
