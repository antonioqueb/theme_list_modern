# -*- coding: utf-8 -*-
"""Favicon SOM en todas las compañías.

Odoo sirve el favicon desde res.company.favicon; este helper lo fija al
logo SOM del módulo. Se ejecuta vía <function> en cada -u (idempotente),
así el branding sobrevive a compañías nuevas y actualizaciones.
"""
import base64
import logging

from odoo import api, models
from odoo.tools import file_open

_logger = logging.getLogger(__name__)


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model
    def _som_apply_brand_favicon(self):
        # GUARDA DURA: esta función corre vía <function> durante la carga de
        # módulos — cualquier excepción aquí ABORTA el registry completo y
        # tumba el servidor (pasó el 19 ago: este build de Odoo 19 no tiene
        # res.company.favicon y el write tronó el arranque de la base).
        if 'favicon' not in self._fields:
            _logger.warning(
                '[SOM BRAND] res.company no tiene campo favicon en este '
                'build; se omite el branding del favicon.')
            return False
        try:
            with file_open(
                    'theme_list_modern/static/img/logosom.png', 'rb') as f:
                data = base64.b64encode(f.read())
            companies = self.sudo().with_context(active_test=False).search([])
            companies.write({'favicon': data})
            _logger.info(
                '[SOM BRAND] Favicon SOM aplicado a %s compañía(s).',
                len(companies))
            return True
        except Exception:
            _logger.exception(
                '[SOM BRAND] No se pudo aplicar el favicon; se omite sin '
                'abortar la carga.')
            return False
