{
    'name': 'Custom List Column Width',
    'version': '19.0.19.0.0',
    'summary': 'Anchos inteligentes de columnas: todo cabe siempre en el ancho de la pantalla',
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