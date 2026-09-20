# -*- coding: utf-8 -*-
from . import models


def post_init_hook(env):
    """Clasifica las actividades ya existentes para el Centro de Actividades."""
    env['som.activity.kind']._som_reclassify_all()
