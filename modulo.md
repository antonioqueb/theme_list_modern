## ./__init__.py
```py
```

## ./__manifest__.py
```py
{
    'name': 'Modern List View Theme',
    'version': '19.0.4.0.0',
    'summary': 'Tema moderno global para todas las vistas de lista en Odoo 19',
    'category': 'Technical',
    'author': 'Alphaqueb Consulting SAS',
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'theme_list_modern/static/src/css/list_modern.scss',
            'theme_list_modern/static/src/js/list_renderer_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
```

## ./static/src/css/list_modern.scss
```scss
/**
 * Modern List View Theme v4.0 - Odoo 19
 * Alphaqueb Consulting SAS
 *
 * v4.0 changes:
 *  - Inputs de listas editables (principal y embebidas) ahora son 100% nativos:
 *    sin fondo blanco custom, sin borde redondeado, sin sombra, sin gradiente.
 *    Se eliminó el bloque CONTROLES MODERNOS y los overrides de inputs en
 *    celdas monetary/integer/float. Los dropdowns/popovers conservan su estilo.
 *
 * v3.9 fixes:
 *  - Wheel scroll vertical no se traba al pasar el cursor sobre la lista.
 *    overflow-y: clip en .o_list_renderer (combinación válida con
 *    overflow-x: auto que no crea scroll container vertical).
 *
 * v3.8 fixes:
 *  - Columnas de lista principal y embebida respetan ancho mínimo por header
 *  - Tablas usan width:max-content + min-width:100%
 *  - Columnas técnicas pequeñas y fijas (selector, handle, optional, acciones, stone toggle)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Variables
// ─────────────────────────────────────────────────────────────────────────────
:root {
    --mlv-font-base: Inter, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --mlv-font-numeric: Inter, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

    --mlv-bg-table:              #ffffff;
    --mlv-bg-header:             #fbfcfe;
    --mlv-bg-row:                #ffffff;
    --mlv-bg-row-alt:            #fbfcfe;
    --mlv-bg-row-hover:          #f5f8ff;
    --mlv-bg-row-selected:       #edf3ff;
    --mlv-bg-row-selected-hover: #e6efff;

    --mlv-border-color:   #e6eaf2;
    --mlv-border-header:  #d7ddea;
    --mlv-border-radius:  14px;

    --mlv-text-header:     #344054;
    --mlv-text-cell:       #111827;
    --mlv-text-muted:      #667085;
    --mlv-text-link:       #344054;
    --mlv-text-link-hover: #101828;

    --mlv-accent:          #2563eb;
    --mlv-accent-strong:   #1d4ed8;
    --mlv-accent-soft:     rgba(37, 99, 235, 0.10);

    --mlv-shadow-table:    0 1px 2px rgba(16, 24, 40, .04), 0 12px 32px rgba(16, 24, 40, .06);

    --mlv-transition:      160ms ease;

    --mlv-header-size:     0.79rem;
    --mlv-cell-size:       0.82rem;
    --mlv-header-weight:   700;

    --mlv-cell-px:         18px;
    --mlv-cell-py:         14px;
    --mlv-header-py:       13px;
    --mlv-row-height:      54px;

    --mlv-control-height-compact:  34px;

    --mlv-check-border:        #98a2b3;
    --mlv-check-checked-bg:    #2563eb;

    --mlv-overlay-max-height:  min(70vh, 640px);
    --mlv-modal-max-height:    82vh;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contenedor
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view {
    background: transparent;
    border: none;

    .o_list_renderer,
    > .o_list_renderer {
        background: var(--mlv-bg-table);
        border: 1px solid var(--mlv-border-color);
        border-radius: var(--mlv-border-radius);
        box-shadow: var(--mlv-shadow-table);
        overflow-x: auto !important;
        overflow-y: clip !important;

        &::-webkit-scrollbar { height: 7px; width: 7px; }
        &::-webkit-scrollbar-track { background: transparent; }
        &::-webkit-scrollbar-thumb {
            background: #d0d7e2;
            border-radius: 999px;
            &:hover { background: #b6c0cf; }
        }
    }
}

.o_list_view,
.o_list_renderer,
.o_list_renderer .table-responsive,
.o_content .o_list_renderer {
    overflow-x: auto;
    overflow-y: clip;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view table.o_list_table,
.o_list_renderer table.o_list_table {
    table-layout: auto !important;
    width: max-content !important;
    min-width: 100% !important;
    border-collapse: separate;
    border-spacing: 0;
    font-family: var(--mlv-font-base);
    font-size: var(--mlv-cell-size);
    color: var(--mlv-text-cell);
    background: var(--mlv-bg-table);

    thead {
        position: sticky;
        top: 0;
        z-index: 10;

        tr th {
            background: var(--mlv-bg-header);
            color: var(--mlv-text-header);
            font-size: var(--mlv-header-size);
            font-weight: var(--mlv-header-weight);
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: var(--mlv-header-py) var(--mlv-cell-px);
            border-bottom: 1px solid var(--mlv-border-header);
            border-right: none;
            white-space: nowrap;
            overflow: visible;
            vertical-align: middle;
            position: relative;
            cursor: default;
            transition: color var(--mlv-transition), background var(--mlv-transition);
            box-sizing: border-box;
            width: auto !important;
            min-width: fit-content;

            &:not(:last-child)::after {
                content: '';
                position: absolute;
                right: 0;
                top: 24%;
                height: 52%;
                width: 1px;
                background: var(--mlv-border-color);
            }

            &:first-child { border-top-left-radius: var(--mlv-border-radius); }
            &:last-child  { border-top-right-radius: var(--mlv-border-radius); }

            &.o_column_sortable {
                cursor: pointer;
                user-select: none;

                .o_list_column_title {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    transition: color var(--mlv-transition);
                }

                &:hover {
                    color: var(--mlv-accent-strong);
                    .o_list_column_title { color: var(--mlv-accent-strong); }
                }
            }

            &.o_list_record_selector,
            &.o_list_selection_box {
                width: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                text-align: center;
                padding: var(--mlv-header-py) 4px !important;
            }

            &.o_list_optional_columns_dropdown {
                width: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                text-align: center;
                padding: var(--mlv-header-py) 4px !important;
            }

            i.fa { font-size: 0.75rem; color: #98a2b3; }
        }
    }

    tbody {
        tr.o_data_row {
            min-height: var(--mlv-row-height);
            background: var(--mlv-bg-row);
            transition: background var(--mlv-transition), box-shadow var(--mlv-transition);
            border-bottom: 1px solid var(--mlv-border-color);

            &:nth-child(even) { background: var(--mlv-bg-row-alt); }

            &:not(.o_selected_row):hover { background: var(--mlv-bg-row-hover); }

            &.o_selected_row {
                background: var(--mlv-bg-row-selected);
                box-shadow: inset 3px 0 0 var(--mlv-accent);
                &:hover { background: var(--mlv-bg-row-selected-hover); }
            }

            &.o_is_dirty {
                box-shadow: inset 3px 0 0 #f97316;
                background: #fffaf5;
            }

            td {
                padding: var(--mlv-cell-py) var(--mlv-cell-px);
                vertical-align: middle;
                font-size: var(--mlv-cell-size);
                color: var(--mlv-text-cell);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                border-bottom: 1px solid var(--mlv-border-color);
                box-sizing: border-box;
                width: auto;

                &.o_list_record_selector {
                    width: 30px !important;
                    min-width: 30px !important;
                    max-width: 30px !important;
                    text-align: center;
                    padding: var(--mlv-cell-py) 4px !important;
                }

                a, .o_form_uri {
                    color: var(--mlv-text-link);
                    text-decoration: none;
                    font-weight: 600;
                    transition: color var(--mlv-transition), opacity var(--mlv-transition);
                    &:hover { color: var(--mlv-text-link-hover); text-decoration: none; opacity: .88; }
                }

                .text-primary, .link-primary { color: var(--mlv-text-link) !important; }

                .badge {
                    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em;
                    padding: 5px 12px; border-radius: 999px; border: 1px solid transparent;
                    display: inline-flex; align-items: center; gap: 4px; line-height: 1.3;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.5);
                }

                .badge.text-bg-success, .badge.bg-success    { background: #ecfdf3 !important; color: #027a48 !important; border-color: #abefc6 !important; }
                .badge.text-bg-danger,  .badge.bg-danger     { background: #fef3f2 !important; color: #b42318 !important; border-color: #fecdca !important; }
                .badge.text-bg-warning, .badge.bg-warning    { background: #fffaeb !important; color: #b54708 !important; border-color: #fedf89 !important; }
                .badge.text-bg-info,    .badge.bg-info       { background: #eff8ff !important; color: #175cd3 !important; border-color: #b2ddff !important; }
                .badge.text-bg-primary, .badge.bg-primary    { background: #eef4ff !important; color: #3538cd !important; border-color: #c7d7fe !important; }
                .badge.text-bg-secondary,.badge.bg-secondary { background: #f8f9fc !important; color: #344054 !important; border-color: #d0d5dd !important; }
                .badge.text-bg-dark,    .badge.bg-dark       { background: #f8f9fc !important; color: #344054 !important; border-color: #d0d5dd !important; }
                .badge.text-bg-light,   .badge.bg-light      { background: #fcfcfd !important; color: #475467 !important; border-color: #eaecf0 !important; }

                .o_tag {
                    font-size: 0.73rem; font-weight: 700; letter-spacing: 0.01em;
                    padding: 4px 10px; border-radius: 999px; border: 1px solid transparent;
                    display: inline-flex; align-items: center; gap: 4px; line-height: 1.35;
                    &:not([style*="background"]) { background: #eef4ff; color: #3538cd; border-color: #c7d7fe; }
                }

                .o_status {
                    width: 11px; height: 11px; border-radius: 50%; display: inline-block;
                    box-shadow: 0 0 0 3px rgba(17, 24, 39, 0.05);
                    &.o_status_green { background: #12b76a; }
                    &.o_status_red   { background: #f04438; }
                    &.o_status_grey  { background: #d0d5dd; }
                }

                &.o_monetary_cell, &.o_integer_cell, &.o_float_cell {
                    text-align: center;
                    font-variant-numeric: tabular-nums;
                    font-family: var(--mlv-font-numeric);
                    font-size: 0.87rem; font-weight: 700; color: #101828;
                }

                .o_field_boolean .o_checkbox,
                .o_field_boolean input[type="checkbox"] {
                    accent-color: var(--mlv-accent); width: 16px; height: 16px;
                }

                .o_list_record_remove, .o_btn_list_action {
                    opacity: 0; transition: opacity var(--mlv-transition);
                }
            }

            &:hover td .o_list_record_remove,
            &:hover td .o_btn_list_action { opacity: 1; }
        }

        tr.o_list_add_record td { padding: 12px var(--mlv-cell-px); font-size: var(--mlv-cell-size); }

        tr.o_list_no_content_helper td,
        .o_nocontent_help td {
            padding: 60px var(--mlv-cell-px);
            text-align: center; color: var(--mlv-text-muted); font-size: 0.92rem;
        }
    }

    tfoot tr {
        border-top: 1px solid var(--mlv-border-header);
        background: #ffffff;
        td {
            padding: var(--mlv-cell-py) var(--mlv-cell-px);
            font-weight: 800; font-size: 0.90rem;
            font-variant-numeric: tabular-nums; font-family: var(--mlv-font-numeric);
            color: #101828; text-align: center;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Columnas técnicas pequeñas y fijas
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view table.o_list_table,
.o_list_renderer table.o_list_table {
    th.o_list_record_selector,
    td.o_list_record_selector,
    th.o_list_selection_box,
    td.o_list_selection_box {
        width: 30px !important;
        min-width: 30px !important;
        max-width: 30px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        text-align: center !important;
    }

    th.o_list_optional_columns_dropdown,
    td.o_list_optional_columns_dropdown {
        width: 30px !important;
        min-width: 30px !important;
        max-width: 30px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        text-align: center !important;
    }

    th.o_handle_cell,
    td.o_handle_cell,
    th.o_row_handle,
    td.o_row_handle,
    th[class*="handle"],
    td[class*="handle"] {
        width: 30px !important;
        min-width: 30px !important;
        max-width: 30px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        text-align: center !important;
    }

    th[data-name="is_stone_expanded"],
    td[name="is_stone_expanded"],
    td.o_data_cell[data-name="is_stone_expanded"],
    .o_stone_toggle_column {
        width: 30px !important;
        min-width: 30px !important;
        max-width: 30px !important;
        padding-left: 4px !important;
        padding-right: 4px !important;
        text-align: center !important;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stone button
// ─────────────────────────────────────────────────────────────────────────────
.stone-field-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
    position: relative;
}

.stone-toggle-btn {
    width: 24px !important;
    height: 24px !important;
    min-width: 24px !important;
    max-width: 24px !important;
    padding: 0 !important;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    line-height: 1;
    position: relative;
}

.stone-count-badge {
    position: absolute;
    top: 0;
    right: 0;
    transform: translate(40%, -35%);
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkboxes
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view input[type="checkbox"] {
    appearance: none; -webkit-appearance: none;
    width: 16px; height: 16px;
    border: 1.5px solid var(--mlv-check-border); border-radius: 5px;
    background: #fff; cursor: pointer;
    transition: all var(--mlv-transition);
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    vertical-align: middle; flex-shrink: 0;
    box-shadow: 0 1px 1px rgba(16, 24, 40, 0.03);

    &:checked {
        background: var(--mlv-check-checked-bg); border-color: var(--mlv-check-checked-bg);
        &::after {
            content: ''; display: block; width: 9px; height: 6px;
            border-left: 2px solid #fff; border-bottom: 2px solid #fff;
            transform: rotate(-45deg) translate(1px, -1px);
        }
    }

    &:indeterminate {
        background: var(--mlv-check-checked-bg); border-color: var(--mlv-check-checked-bg);
        &::after { content: ''; display: block; width: 7px; height: 2px; background: #fff; border-radius: 1px; }
    }

    &:hover:not(:checked) { border-color: var(--mlv-accent); background: var(--mlv-accent-soft); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Add record
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view .o_list_add_record a,
.o_list_view a.o_list_add_optional_columns {
    font-size: 0.84rem; font-weight: 700; color: #344054; text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 0;
    transition: color var(--mlv-transition), opacity var(--mlv-transition);
    &:hover { color: #101828; opacity: .9; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs editables: apariencia 100% nativa (sin overrides del tema)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Many2many tags / impuestos
// ─────────────────────────────────────────────────────────────────────────────
.o_list_view .o_field_many2manytags,
.o_form_view .o_field_one2many .o_field_many2manytags {
    display: flex !important; align-items: center; flex-wrap: wrap !important; gap: 6px;
    min-height: var(--mlv-control-height-compact); height: auto !important;
    white-space: normal !important; overflow: visible !important;
    padding-top: 4px; padding-bottom: 4px;
}

.o_list_view .o_field_many2manytags .o_tag,
.o_list_view .o_field_many2manytags .badge,
.o_form_view .o_field_one2many .o_field_many2manytags .o_tag,
.o_form_view .o_field_one2many .o_field_many2manytags .badge {
    max-width: none !important; white-space: nowrap;
    overflow: visible !important; text-overflow: unset !important; flex: 0 0 auto;
}

.o_list_view .o_field_many2manytags .o_delete,
.o_list_view .o_field_many2manytags .o_tag_badge_text + span,
.o_form_view .o_field_one2many .o_field_many2manytags .o_delete,
.o_form_view .o_field_one2many .o_field_many2manytags .o_tag_badge_text + span {
    display: inline-flex; align-items: center; justify-content: center;
    margin-left: 6px; border-radius: 999px; cursor: pointer;
}

.o_list_view td .o_field_many2manytags,
.o_form_view .o_field_one2many td .o_field_many2manytags {
    white-space: normal !important; overflow: visible !important;
}

.o_list_view td:has(.o_field_many2manytags),
.o_form_view .o_field_one2many td:has(.o_field_many2manytags) {
    white-space: normal !important; overflow: visible !important; text-overflow: unset !important;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dropdowns / menus / popovers — FIX SCROLL VERTICAL
// ─────────────────────────────────────────────────────────────────────────────
.o-dropdown--menu,
.dropdown-menu,
.o_popover,
.ui-autocomplete,
.o-autocomplete--dropdown-menu,
.o_select_menu_menu,
.o-select-menu__menu,
.o_overlay_container .popover,
.o_web_client .o_debug_manager .dropdown-menu {
    border: 1px solid #e4e7ec !important; border-radius: 16px !important;
    background: rgba(255,255,255,.98) !important; backdrop-filter: blur(12px);
    box-shadow: 0 10px 20px rgba(16,24,40,.08), 0 24px 48px rgba(16,24,40,.12) !important;
    padding: 8px !important;
    max-height: var(--mlv-overlay-max-height) !important;
    overflow-y: auto !important; overflow-x: hidden !important;
    overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
}

.o-dropdown--menu .dropdown-item,
.dropdown-menu .dropdown-item,
.ui-menu-item-wrapper,
.o-autocomplete--dropdown-menu .dropdown-item,
.o_select_menu_menu .dropdown-item,
.o-select-menu__menu .dropdown-item {
    border-radius: 10px !important; font-size: 0.84rem; font-weight: 500;
    color: #101828 !important; padding: 9px 11px !important;
    transition: background var(--mlv-transition), color var(--mlv-transition);
    &:hover, &:focus, &.active { background: #f5f8ff !important; color: #0f172a !important; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modales / popups — FIX SCROLL VERTICAL
// ─────────────────────────────────────────────────────────────────────────────
.modal,
.o_dialog_container .modal,
.o_overlay_container .modal {
    overflow-y: auto !important; overflow-x: hidden !important;
}

.modal-dialog,
.o_dialog_container .modal-dialog,
.o_overlay_container .modal-dialog {
    max-height: calc(100vh - 2rem); display: flex; align-items: flex-start;
}

.modal-content,
.o_dialog_container .modal-content,
.o_overlay_container .modal-content {
    max-height: var(--mlv-modal-max-height); display: flex; flex-direction: column; overflow: hidden;
}

.modal-body,
.o_dialog_container .modal-body,
.o_overlay_container .modal-body,
.modal .o_view_controller,
.o_dialog_container .o_view_controller {
    overflow-y: auto !important; overflow-x: auto !important;
    max-height: calc(var(--mlv-modal-max-height) - 110px);
    -webkit-overflow-scrolling: touch;
}

.modal .o_list_renderer,
.o_dialog_container .o_list_renderer,
.o_overlay_container .o_list_renderer {
    overflow-x: auto !important; overflow-y: clip !important;
}

// ─────────────────────────────────────────────────────────────────────────────
// Columnas opcionales toggle
// ─────────────────────────────────────────────────────────────────────────────
.o_list_optional_columns_dropdown .o_optional_columns_dropdown_toggle {
    color: #667085; cursor: pointer;
    transition: color var(--mlv-transition), background var(--mlv-transition);
    padding: 4px 7px; border-radius: 9px;
    &:hover { color: #101828; background: #f2f4f7; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista embebida en formulario
// ─────────────────────────────────────────────────────────────────────────────
.o_form_view .o_field_one2many .o_list_renderer table.o_list_table,
.o_form_view .o_field_many2many .o_list_renderer table.o_list_table,
.o_form_view .o_field_widget .o_list_renderer table.o_list_table {
    table-layout: auto !important;
    width: max-content !important;
    min-width: 100% !important;
}

.o_form_view .o_field_one2many .o_list_renderer,
.o_form_view .o_field_many2many .o_list_renderer,
.o_form_view .o_field_widget .o_list_renderer {
    overflow-x: auto !important;
    overflow-y: clip !important;
    box-shadow: none;
    border: 1px solid var(--mlv-border-color);
    border-radius: var(--mlv-border-radius);
    background: #fff;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reportes contables — resetear estilos del tema
// ─────────────────────────────────────────────────────────────────────────────
.o_account_report_scroll_container,
.o_account_reports_page,
.o_account_report,
.o_account_financial_report {

    table {
        min-width: unset !important; width: auto !important;
        max-width: 100% !important; table-layout: auto !important;
        font-family: inherit !important; font-size: inherit !important;

        thead tr th, tbody tr td, tfoot tr td {
            white-space: normal !important; overflow: visible !important;
            text-overflow: unset !important; padding: inherit !important;
            font-size: inherit !important; font-weight: inherit !important;
            font-variant-numeric: inherit !important; color: inherit !important;
            background: inherit !important; border-bottom: inherit !important;
            letter-spacing: inherit !important; text-transform: inherit !important;
            vertical-align: middle !important; box-shadow: none !important;
            text-align: inherit !important;
        }
    }

    .o_list_renderer { overflow-x: hidden !important; box-shadow: none !important; }

    input, select, textarea, .o_input, .o-autocomplete input {
        all: revert !important;
    }
}

.o_account_report_scroll_container {
    display: block !important; width: fit-content !important;
    max-width: 100% !important; margin-left: auto !important;
    margin-right: auto !important; overflow-x: auto !important;

    > div {
        display: flex !important; align-items: flex-start !important;
        justify-content: center !important;
    }
}```

## ./static/src/js/list_renderer_patch.js
```js
/**
 * Modern List View Theme v3.3 - Stable column width enforcement
 * Alphaqueb Consulting SAS
 *
 * Objetivo:
 *  - Respetar SIEMPRE el ancho mínimo necesario para mostrar completo
 *    el nombre del encabezado de cada columna.
 *  - Aplicar tanto a listas principales como a listas embebidas.
 *  - Evitar que columnas técnicas (drag, favorito, selector, acciones, stone toggle)
 *    se expandan incorrectamente.
 *  - Recalcular automáticamente al abrir la vista, sin requerir refresh manual.
 */

import { patch } from "@web/core/utils/patch";
import { ListRenderer } from "@web/views/list/list_renderer";
import { onMounted, onPatched } from "@odoo/owl";

// ─────────────────────────────────────────────────────────────────────────────
// Tablas que NO deben tocarse
// ─────────────────────────────────────────────────────────────────────────────
function shouldSkipTable(tableEl) {
    return !!tableEl.closest(
        ".o_account_report_scroll_container, " +
        ".o_account_reports_page, " +
        ".o_account_report, " +
        ".o_account_financial_report, " +
        ".o_account_report_line, " +
        "[class*='account_report'], " +
        ".o_report_layout"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Columnas técnicas que NO deben entrar al cálculo dinámico
// ─────────────────────────────────────────────────────────────────────────────
function isSpecialColumn(th) {
    if (!th) return true;

    const className = th.className || "";
    const text = (th.textContent || "").trim();
    const dataName = th.getAttribute("data-name") || th.getAttribute("name") || "";

    return (
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box") ||
        th.classList.contains("o_list_optional_columns_dropdown") ||
        th.classList.contains("o_handle_cell") ||
        th.classList.contains("o_row_handle") ||
        th.classList.contains("o_list_button") ||
        th.classList.contains("o_list_action") ||
        th.classList.contains("o_list_record_remove") ||
        th.classList.contains("o_field_handle") ||
        th.classList.contains("o_stone_toggle_column") ||
        dataName === "is_stone_expanded" ||
        /handle|selector|selection|optional|remove|action/.test(className) ||
        (
            text === "" &&
            (
                th.querySelector(".fa") ||
                th.querySelector(".oi") ||
                th.querySelector(".btn") ||
                th.querySelector(".dropdown-toggle") ||
                th.querySelector(".o_handle_cell") ||
                th.querySelector(".o_row_handle") ||
                th.querySelector(".o_optional_columns_dropdown_toggle")
            )
        )
    );
}

function getSpecialColumnWidth(th) {
    if (!th) return 30;

    const className = th.className || "";
    const dataName = th.getAttribute("data-name") || th.getAttribute("name") || "";

    if (
        th.classList.contains("o_list_record_selector") ||
        th.classList.contains("o_list_selection_box")
    ) {
        return 30;
    }

    if (th.classList.contains("o_list_optional_columns_dropdown")) {
        return 30;
    }

    if (
        th.classList.contains("o_handle_cell") ||
        th.classList.contains("o_row_handle") ||
        /handle/.test(className)
    ) {
        return 30;
    }

    if (
        th.classList.contains("o_stone_toggle_column") ||
        dataName === "is_stone_expanded"
    ) {
        return 30;
    }

    if (
        th.classList.contains("o_list_record_remove") ||
        th.classList.contains("o_list_action") ||
        /remove|action/.test(className)
    ) {
        return 30;
    }

    return 30;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabla expandible real
// ─────────────────────────────────────────────────────────────────────────────
function enforceTableExpansion(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    tableEl.style.tableLayout = "auto";
    tableEl.style.width = "max-content";
    tableEl.style.minWidth = "100%";

    tableEl.querySelectorAll("thead th").forEach((th) => {
        if (isSpecialColumn(th)) {
            const fixedWidth = getSpecialColumnWidth(th);
            th.style.minWidth = `${fixedWidth}px`;
            th.style.width = `${fixedWidth}px`;
            th.style.maxWidth = `${fixedWidth}px`;
            th.style.whiteSpace = "nowrap";
            th.style.overflow = "hidden";
            th.style.textOverflow = "clip";
            return;
        }

        th.style.whiteSpace = "nowrap";
        th.style.overflow = "visible";
        th.style.textOverflow = "clip";
        th.style.width = "auto";
        th.style.maxWidth = "none";
    });

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        td.style.whiteSpace = "nowrap";
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Medir ancho real del header
// ─────────────────────────────────────────────────────────────────────────────
function getHeaderRequiredWidth(th) {
    const titleEl =
        th.querySelector(".o_list_column_title") ||
        th.querySelector(".o_column_title") ||
        th.querySelector("span") ||
        th;

    const thStyle = window.getComputedStyle(th);
    const padLeft = parseFloat(thStyle.paddingLeft || "0");
    const padRight = parseFloat(thStyle.paddingRight || "0");
    const borderLeft = parseFloat(thStyle.borderLeftWidth || "0");
    const borderRight = parseFloat(thStyle.borderRightWidth || "0");

    const titleWidth = Math.ceil(titleEl.scrollWidth || titleEl.getBoundingClientRect().width || 0);

    const hasSortIcon = !!th.querySelector(".fa, .oi, .o_sort_indicator");
    const extra = hasSortIcon ? 18 : 8;

    return Math.ceil(titleWidth + padLeft + padRight + borderLeft + borderRight + extra);
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicar anchos por columna
// ─────────────────────────────────────────────────────────────────────────────
function syncColumnMinimumWidths(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const headerRow = tableEl.querySelector("thead tr");
    if (!headerRow) return;

    const headerCells = [...headerRow.children];
    if (!headerCells.length) return;

    // Reset previo
    headerCells.forEach((th, index) => {
        const columnCells = tableEl.querySelectorAll(
            `tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`
        );

        if (isSpecialColumn(th)) {
            const fixedWidth = getSpecialColumnWidth(th);

            th.style.minWidth = `${fixedWidth}px`;
            th.style.width = `${fixedWidth}px`;
            th.style.maxWidth = `${fixedWidth}px`;

            columnCells.forEach((cell) => {
                cell.style.minWidth = `${fixedWidth}px`;
                cell.style.width = `${fixedWidth}px`;
                cell.style.maxWidth = `${fixedWidth}px`;
            });
            return;
        }

        th.style.minWidth = "";
        th.style.width = "";
        th.style.maxWidth = "";

        columnCells.forEach((cell) => {
            cell.style.minWidth = "";
            cell.style.width = "";
            cell.style.maxWidth = "";
        });
    });

    requestAnimationFrame(() => {
        headerCells.forEach((th, index) => {
            if (isSpecialColumn(th)) return;

            const minWidth = Math.max(getHeaderRequiredWidth(th), 140);
            if (!minWidth || Number.isNaN(minWidth)) return;

            th.style.minWidth = `${minWidth}px`;
            th.style.width = `${minWidth}px`;
            th.style.maxWidth = "none";

            tableEl.querySelectorAll(
                `tbody tr > *:nth-child(${index + 1}), tfoot tr > *:nth-child(${index + 1})`
            ).forEach((cell) => {
                cell.style.minWidth = `${minWidth}px`;
                cell.style.width = `${minWidth}px`;
                cell.style.maxWidth = "none";
            });
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltips en celdas truncadas
// ─────────────────────────────────────────────────────────────────────────────
function addCellTooltips(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    tableEl.querySelectorAll("tbody td:not(.o_list_record_selector)").forEach((td) => {
        if (td._mlvTip) return;
        td._mlvTip = true;

        td.addEventListener("mouseenter", () => {
            if (td.scrollWidth > td.clientWidth + 2) {
                td.setAttribute("title", td.textContent.trim());
            } else {
                td.removeAttribute("title");
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicación completa
// ─────────────────────────────────────────────────────────────────────────────
function applyModernListSizing(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;
    enforceTableExpansion(tableEl);
    syncColumnMinimumWidths(tableEl);
    addCellTooltips(tableEl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaplicar en fases para esperar estabilización real del DOM
// ─────────────────────────────────────────────────────────────────────────────
function scheduleApply(tableEl) {
    if (!tableEl || shouldSkipTable(tableEl)) return;

    const run = () => applyModernListSizing(tableEl);

    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 60);
    setTimeout(run, 180);
    setTimeout(run, 320);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch ListRenderer
// ─────────────────────────────────────────────────────────────────────────────
patch(ListRenderer.prototype, {
    setup() {
        super.setup(...arguments);

        const apply = () => {
            const tableEl = this.el?.querySelector("table.o_list_table");
            if (tableEl) {
                scheduleApply(tableEl);
            }
        };

        onMounted(() => apply());
        onPatched(() => apply());
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Observer global
// ─────────────────────────────────────────────────────────────────────────────
const _mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const tables = node.classList?.contains("o_list_table")
                ? [node]
                : [...(node.querySelectorAll?.(".o_list_table") || [])];

            for (const t of tables) {
                scheduleApply(t);
            }
        }
    }
});

function reapplyAllTables() {
    document.querySelectorAll("table.o_list_table").forEach((tableEl) => {
        scheduleApply(tableEl);
    });
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        _mo.observe(document.body, { childList: true, subtree: true });

        window.addEventListener("resize", () => {
            window.requestAnimationFrame(reapplyAllTables);
        });

        setTimeout(reapplyAllTables, 150);
        setTimeout(reapplyAllTables, 400);
        setTimeout(reapplyAllTables, 800);
    },
    { once: true }
);```

