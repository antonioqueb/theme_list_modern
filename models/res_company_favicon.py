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
        try:
            with file_open(
                    'theme_list_modern/static/img/logosom.png', 'rb') as f:
                data = base64.b64encode(f.read())
        except Exception:
            _logger.exception('[SOM BRAND] No se pudo leer logosom.png.')
            return False
        companies = self.sudo().with_context(active_test=False).search([])
        companies.write({'favicon': data})
        _logger.info(
            '[SOM BRAND] Favicon SOM aplicado a %s compañía(s).',
            len(companies))
        return True
