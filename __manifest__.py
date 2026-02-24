{
    'name': 'Modern List View Theme',
    'version': '19.0.1.0.0',
    'summary': 'Tema moderno global para todas las vistas de lista en Odoo 19',
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
