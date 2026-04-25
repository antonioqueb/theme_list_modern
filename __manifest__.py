{
    'name': 'Custom List Column Width',
    'version': '19.0.10.0.0',
    'summary': 'Ajuste mínimo y persistente de anchos de columnas en vistas de lista',
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