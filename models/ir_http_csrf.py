# -*- coding: utf-8 -*-
"""Renovación de token CSRF en caliente.

El token CSRF de cada pestaña se acuña al cargar la página y queda ligado al
sid de la sesión; el sid SOLO rota al iniciar sesión. Una pestaña abierta de
antes de un re-login conserva un token muerto y falla exactamente al imprimir
(/report/download es prácticamente el único POST http del cliente web) con
"Session expired (invalid CSRF token)".

Aquí se expone un token fresco en session_info para que el manejador JS
(csrf_recovery.js) lo renueve sin recargar la pestaña. Solo viaja al dueño
autenticado de la sesión — el mismo canal por el que ya viaja en la página.
"""
from odoo import models
from odoo.http import request


class IrHttpCsrf(models.AbstractModel):
    _inherit = 'ir.http'

    def session_info(self):
        info = super().session_info()
        try:
            if request and request.session and request.session.uid:
                info['csrf_token'] = request.csrf_token(None)
        except Exception:  # noqa: BLE001 - jamás romper el arranque del cliente
            pass
        return info
