/** @odoo-module **/
import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { patch } from "@web/core/utils/patch";

// El autocompletar nativo desplaza la lista hasta la opción activa justo al
// terminar de cargar resultados. Si esa opción todavía no está pintada (la
// lista se cerró o se está redibujando), el core llama scrollTo(null) y el
// usuario ve "null is not an object (evaluating 'element.parentElement')".
// Sin opción en pantalla no hay a dónde desplazarse: se omite.
patch(AutoComplete.prototype, {
    scroll() {
        const list = this.listRef && this.listRef.el;
        if (!list || !this.activeSourceOptionId) {
            return;
        }
        if (!list.querySelector(`#${this.activeSourceOptionId}`)) {
            return;
        }
        return super.scroll(...arguments);
    },
});
