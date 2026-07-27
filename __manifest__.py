{
    'name': 'Custom List Column Width',
    'version': '19.0.21.0.0',
    'summary': 'Anchos inteligentes de columnas + Búsqueda Global Inteligente (barra fija del home)',
    'category': 'Technical',
    'author': 'Alphaqueb Consulting SAS',
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'theme_list_modern/static/src/css/list_modern.scss',
            'theme_list_modern/static/src/js/list_renderer_patch.js',
            'theme_list_modern/static/src/global_search/global_search.scss',
            'theme_list_modern/static/src/global_search/global_search.xml',
            'theme_list_modern/static/src/global_search/global_search.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}