"""Reclasifica las actividades con el catálogo ampliado ("Re-autorizar
precios" de versiones anteriores del flujo de precios). Idempotente."""
import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    n = env['som.activity.kind']._som_reclassify_all()
    _logger.info('[theme_list_modern] Centro de Actividades: %s actividad(es) reclasificadas.', n)
