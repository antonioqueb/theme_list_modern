{
    'name': 'Custom List Column Width',
    'version': '19.0.28.9.0',
    'summary': 'Anchos inteligentes de columnas + Búsqueda Global Inteligente (barra fija del home)',
    'category': 'Technical',
    'author': 'Alphaqueb Consulting SAS',
    'depends': ['web'],
    'data': [
        'views/som_branding_templates.xml',
    ],
    'assets': {
        'web._assets_primary_variables': [
            ('prepend', 'theme_list_modern/static/src/scss/som_colors_variables.scss'),
        ],
        'web.assets_frontend': [
            'theme_list_modern/static/src/scss/som_colors_frontend.scss',
        ],
        'web.assets_backend': [
            'theme_list_modern/static/src/scss/som_colors_backend.scss',
            'theme_list_modern/static/src/css/list_modern.scss',
            'theme_list_modern/static/src/js/list_renderer_patch.js',
            'theme_list_modern/static/src/js/uppercase_inputs.js',
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