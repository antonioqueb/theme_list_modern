"""Puesta al día de avisos del Centro de Actividades: entre el 20 y el 23 de
septiembre de 2026 action_notify estuvo apagado. Un aviso resumen por usuario
(bandeja + correo) con sus actividades vivas asignadas desde el 20 sep.
Idempotente (omite lo ya avisado)."""
import logging

from odoo import api, SUPERUSER_ID

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    if not version:
        return
    env = api.Environment(cr, SUPERUSER_ID, {})
    try:
        result = env['som.activity.hub']._som_catchup_notify('2026-09-20 00:00:00')
    except Exception:  # noqa: BLE001 - jamás abortar el -u por un aviso
        _logger.exception('[theme_list_modern] puesta al día de avisos fallida')
        return
    _logger.info('[theme_list_modern] puesta al día de avisos: %s usuario(s), %s actividad(es).',
                 len(result), sum(result.values()))
