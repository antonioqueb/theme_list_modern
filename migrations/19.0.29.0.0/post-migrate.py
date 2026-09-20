"""Centro de Actividades SOM: clasifica las actividades ya existentes.

El catálogo (som.activity.kind) se carga antes de este script; aquí se
recorren todas las actividades (activas y archivadas) y se les asigna su
tipo SOM por (modelo, prefijo del resumen). Sin esto, las actividades
anteriores a esta versión seguirían apareciendo en el relojito.
"""
import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    n = env['som.activity.kind']._som_reclassify_all()
    _logger.info('[theme_list_modern] Centro de Actividades: %s actividad(es) clasificadas.', n)
