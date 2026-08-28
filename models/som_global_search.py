# -*- coding: utf-8 -*-
"""Búsqueda global inteligente — backend de la barra fija del home.

Un solo RPC (`search_everything`) resuelve el término contra todos los
modelos operativos del ERP: folios de venta/compra, lotes, productos,
transferencias, órdenes de taller, holds, viajes de la Torre de Control,
facturas y contactos.

Diseño:
- AbstractModel (sin tabla, sin ACL propia): cada búsqueda corre con los
  permisos del usuario; los modelos a los que no tiene acceso simplemente
  no aparecen en los resultados (try/except AccessError por grupo).
- Los modelos de módulos opcionales se consultan solo si existen en el
  registry (`model in self.env`), así el tema no depende de ellos.
- Límite por grupo y orden por relevancia (escritura reciente primero):
  una sola ida al servidor por búsqueda, sin N+1.
"""
import logging

from odoo import api, models, _
from odoo.exceptions import AccessError

_logger = logging.getLogger(__name__)

LIMIT_PER_GROUP = 8
MIN_TERM_LENGTH = 2


class SomGlobalSearch(models.AbstractModel):
    _name = 'som.global.search'
    _description = 'Búsqueda Global Inteligente'

    # ------------------------------------------------------------------
    # Definición de objetivos de búsqueda
    # ------------------------------------------------------------------
    def _selection_label(self, record, field_name):
        """Etiqueta humana de un campo selection ('sale' → 'Orden de venta')."""
        field = record._fields.get(field_name)
        if not field:
            return ''
        value = record[field_name]
        if not value:
            return ''
        return dict(field._description_selection(record.env)).get(value, '')

    def _sale_order_domain(self, term):
        """Ventas por folio, referencia del cliente y JOB NAME / PROYECTO
        (x_project_id, lo agrega otro módulo: se usa solo si existe). Así al
        teclear el nombre del proyecto aparecen las órdenes de ese pedido."""
        domain = ['|', ('name', 'ilike', term), ('client_order_ref', 'ilike', term)]
        so_fields = self.env['sale.order']._fields
        if 'x_project_id' in so_fields:
            domain = ['|'] + domain + [('x_project_id.name', 'ilike', term)]
        return domain

    def _sale_order_describe(self, r):
        project = ''
        if 'x_project_id' in r._fields and r.x_project_id:
            project = 'Job: %s' % r.x_project_id.display_name
        return ' · '.join(filter(None, [
            r.partner_id.name,
            project,
            self._selection_label(r, 'state'),
        ]))

    def _get_targets(self):
        """Lista ordenada de modelos a consultar.

        Cada target: model, label, icon (FontAwesome), build_domain(term) y
        describe(record) → línea secundaria legible del renglón.
        """
        return [
            {
                'model': 'sale.order',
                'label': _('Ventas y Cotizaciones'),
                'icon': 'fa-file-text-o',
                'build_domain': self._sale_order_domain,
                'describe': self._sale_order_describe,
            },
            {
                'model': 'purchase.order',
                'label': _('Órdenes de Compra'),
                'icon': 'fa-shopping-cart',
                'build_domain': lambda term: [
                    '|', ('name', 'ilike', term),
                    ('partner_ref', 'ilike', term),
                ],
                'describe': lambda r: ' · '.join(filter(None, [
                    r.partner_id.name,
                    self._selection_label(r, 'state'),
                ])),
            },
            {
                'model': 'stock.picking',
                'label': _('Transferencias y Recepciones'),
                'icon': 'fa-exchange',
                'build_domain': lambda term: [
                    '|', ('name', 'ilike', term),
                    ('origin', 'ilike', term),
                ],
                'describe': lambda r: ' · '.join(filter(None, [
                    r.picking_type_id.name,
                    r.origin or '',
                    self._selection_label(r, 'state'),
                ])),
            },
            {
                'model': 'stock.lot',
                'label': _('Lotes / Placas'),
                'icon': 'fa-barcode',
                # Incluye lotes archivados (entregados/dados de baja): el
                # front los enruta al Walkthrough en vez del Inventario
                # Visual. El término explícito de active desactiva el
                # filtro automático active_test.
                'build_domain': lambda term: (
                    [('name', 'ilike', term)]
                    + ([('active', 'in', [True, False])]
                       if 'active' in self.env['stock.lot']._fields else [])
                ),
                'describe': lambda r: r.product_id.display_name or '',
            },
            {
                'model': 'product.product',
                'label': _('Productos'),
                'icon': 'fa-cube',
                'build_domain': lambda term: [
                    '|', '|', ('name', 'ilike', term),
                    ('default_code', 'ilike', term),
                    ('barcode', 'ilike', term),
                ],
                'describe': lambda r: r.default_code or '',
            },
            {
                'model': 'workshop.order',
                'label': _('Órdenes de Taller'),
                'icon': 'fa-wrench',
                'build_domain': lambda term: [('name', 'ilike', term)],
                'describe': lambda r: ' · '.join(filter(None, [
                    getattr(r, 'process_id', False) and r.process_id.name or '',
                    self._selection_label(r, 'state'),
                ])),
            },
            {
                'model': 'stock.lot.hold.order',
                'label': _('Holds / Apartados'),
                'icon': 'fa-hand-paper-o',
                'build_domain': lambda term: [('name', 'ilike', term)],
                'describe': lambda r: ' · '.join(filter(None, [
                    getattr(r, 'partner_id', False) and r.partner_id.name or '',
                    self._selection_label(r, 'estado') or self._selection_label(r, 'state'),
                ])),
            },
            {
                'model': 'stock.transit.voyage',
                'label': _('Torre de Control'),
                'icon': 'fa-ship',
                'build_domain': lambda term: [
                    '|', ('name', 'ilike', term),
                    ('bl_number', 'ilike', term),
                ],
                'describe': lambda r: ' · '.join(filter(None, [
                    getattr(r, 'bl_number', '') or '',
                    self._selection_label(r, 'custom_status'),
                ])),
            },
            {
                'model': 'account.move',
                'label': _('Facturas'),
                'icon': 'fa-file-o',
                'build_domain': lambda term: [
                    ('move_type', '!=', 'entry'),
                    '|', '|', ('name', 'ilike', term),
                    ('ref', 'ilike', term),
                    ('payment_reference', 'ilike', term),
                ],
                'describe': lambda r: ' · '.join(filter(None, [
                    r.partner_id.name,
                    self._selection_label(r, 'state'),
                ])),
            },
            {
                'model': 'res.partner',
                'label': _('Contactos'),
                'icon': 'fa-user-o',
                'build_domain': lambda term: [
                    '|', '|', ('name', 'ilike', term),
                    ('vat', 'ilike', term),
                    ('ref', 'ilike', term),
                ],
                'describe': lambda r: r.email or r.phone or '',
            },
        ]

    # ------------------------------------------------------------------
    # RPC principal
    # ------------------------------------------------------------------
    @api.model
    def _annotate_lot_stock(self, rows):
        """Marca cada fila de lote con has_stock: True si aún tiene
        existencias (internal/transit/production). El front usa la marca
        para abrir el Inventario Visual (con stock) o el Walkthrough
        (entregado / dado de baja)."""
        lot_ids = [r['id'] for r in rows]
        if not lot_ids:
            return
        in_stock = set()
        try:
            groups = self.env['stock.quant'].sudo().read_group(
                [
                    ('lot_id', 'in', lot_ids),
                    ('quantity', '>', 0),
                    ('location_id.usage', 'in', ['internal', 'transit', 'production']),
                ],
                ['lot_id'],
                ['lot_id'],
            )
            in_stock = {g['lot_id'][0] for g in groups if g.get('lot_id')}
        except Exception:
            _logger.exception(
                "[GLOBAL SEARCH] No se pudo calcular stock de lotes; "
                "se asume que todos tienen existencias."
            )
            in_stock = set(lot_ids)
        for row in rows:
            row['has_stock'] = row['id'] in in_stock

    @api.model
    def search_everything(self, term):
        """Busca `term` en todos los objetivos y regresa grupos listos para
        pintar: [{model, label, icon, domain, records:[{id, name, sub}]}].
        """
        term = (term or '').strip()
        if len(term) < MIN_TERM_LENGTH:
            return []

        groups = []
        for target in self._get_targets():
            model_name = target['model']
            if model_name not in self.env:
                continue
            try:
                Model = self.env[model_name]
                domain = target['build_domain'](term)
                records = Model.search(
                    domain, limit=LIMIT_PER_GROUP, order='write_date desc',
                )
                if not records:
                    continue
                rows = []
                for record in records:
                    try:
                        sub = target['describe'](record) or ''
                    except Exception:
                        sub = ''
                    rows.append({
                        'id': record.id,
                        'name': record.display_name or '',
                        'sub': sub,
                    })
                if model_name == 'stock.lot':
                    self._annotate_lot_stock(rows)
                groups.append({
                    'model': model_name,
                    'label': target['label'],
                    'icon': target['icon'],
                    # Dominio serializable para "ver todos" (abre la lista).
                    'domain': domain,
                    'records': rows,
                })
            except AccessError:
                # Sin permiso sobre este modelo: el grupo no aparece.
                continue
            except Exception:
                _logger.exception(
                    "[GLOBAL SEARCH] Falló la búsqueda en %s; se omite el grupo.",
                    model_name,
                )
                continue

        return groups
