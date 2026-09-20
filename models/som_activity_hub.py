# -*- coding: utf-8 -*-
"""Centro de Actividades SOM — un solo lugar para las notificaciones del ERP.

Problema que resuelve
---------------------
Todos los módulos SOM avisan con actividades del tipo nativo "Por hacer"
(autorizaciones de precio/descuento/entrega/comisión, incidencias de cobro,
caja chica, arribos a puerto, etc.). Todas caían al relojito del systray
mezcladas con las actividades manuales, sin forma de saber de dónde nacieron
ni de filtrarlas, y cuando un flujo tenía varios autorizadores las de los
demás quedaban colgadas.

Diseño
------
- `som.activity.kind`: CATÁLOGO declarativo de las actividades que generan
  los módulos SOM. Cada tipo se reconoce por (modelo, prefijo del summary):
  ningún módulo tiene que cambiar su `activity_schedule`. Lo que NO está en
  el catálogo es una actividad nativa (agendada a mano) y sigue en el
  relojito como siempre.
- `mail.activity.x_som_kind_id`: se clasifica al crear (y con
  `_som_reclassify_all` para las ya existentes). Es el único campo por el
  que todo lo demás filtra.
- Relojito: `res.users._get_activity_groups` corre con un contexto que hace
  que `mail.activity._search` excluya las actividades con tipo SOM. El
  contador del systray sale de esa misma función, así que baja solo.
- Cierre compartido: al marcar hecha una actividad de un tipo `shared`, las
  hermanas (mismo documento + mismo tipo, otros usuarios) se archivan en
  silencio con feedback "Atendida por X". Red de seguridad generica para
  cualquier flujo con varios autorizadores.
- `som.activity.pref`: por usuario y tipo, si quiere ver ese tipo en el
  centro. Apagado = no se muestra ni cuenta (no se borra nada: el documento
  y los demás usuarios siguen igual).
- `som.activity.hub`: AbstractModel con los RPC del client action OWL.
"""
import logging
import re
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.fields import Domain
from odoo.tools import html2plaintext
from odoo.tools.safe_eval import safe_eval
from odoo.addons.mail.tools.discuss import Store

_logger = logging.getLogger(__name__)

CTX_SYSTRAY_EXCLUDE = 'som_hub_systray_exclude'

CATEGORIES = [
    ('auth', 'Autorizaciones'),
    ('cobranza', 'Cobranza y pagos'),
    ('comisiones', 'Comisiones'),
    ('caja', 'Caja'),
    ('inventario', 'Inventario y logística'),
    ('avisos', 'Avisos de venta'),
    ('sistema', 'Sistema'),
    ('manual', 'Actividades manuales'),
]
NATIVE_KEY = 'native'


class SomActivityKind(models.Model):
    _name = 'som.activity.kind'
    _description = 'Tipo de actividad SOM (Centro de Actividades)'
    _order = 'category, sequence, id'

    name = fields.Char('Nombre', required=True)
    key = fields.Char('Clave técnica', required=True, index=True)
    res_model = fields.Char(
        'Modelo', index=True,
        help="Modelo técnico del documento (sale.order, petty.cash.entry…). "
             "Vacío = cualquier modelo: se reconoce solo por el prefijo.")
    summary_prefixes = fields.Text(
        'Prefijos del resumen',
        help="Uno por línea. La actividad se reconoce si su resumen EMPIEZA "
             "por alguno (sin distinguir mayúsculas).")
    category = fields.Selection(CATEGORIES, 'Categoría', required=True, default='avisos')
    icon = fields.Char('Ícono (Font Awesome)', default='fa-bell')
    color = fields.Char('Color', default='#0b57d0')
    sequence = fields.Integer('Secuencia', default=10)
    shared = fields.Boolean(
        'Una resolución cierra a todos', default=False,
        help="El flujo crea una actividad por autorizador. Cuando uno la "
             "atiende, las de los demás se cierran solas.")
    description = fields.Char('Descripción', help="Texto corto que ve el usuario al configurar.")
    group_xmlids = fields.Char(
        'Grupos con permiso',
        help="XML-IDs de res.groups separados por coma (p.ej. "
             "inventory_shopping_cart.group_price_authorizer). Solo quien pertenezca a "
             "alguno puede activar este tipo. Vacío = basta con poder leer el modelo.")
    notice = fields.Boolean(
        'Aviso informativo', default=False,
        help="No hay nada que hacer: el Centro lo muestra con botón «Enterado» y "
             "se archiva solo pasados los días indicados.")
    notice_days = fields.Integer('Días de vigencia del aviso', default=7)
    resolved_domain = fields.Char(
        'Dominio de resolución',
        help="Dominio sobre el documento origen. Cuando el documento lo cumple, la actividad se "
             "archiva sola (cron horario). Puede usar la variable activity_date "
             "(fecha de creación de la actividad), p.ej. "
             "[('invoice_ids','any',[('state','=','posted'),('create_date','>=',activity_date)])].")
    resolved_label = fields.Char(
        'Texto al resolver', help="Feedback que queda en la actividad archivada.")
    active = fields.Boolean(default=True)

    _key_unique = models.Constraint('UNIQUE(key)', 'La clave técnica del tipo debe ser única.')

    @api.constrains('resolved_domain')
    def _check_resolved_domain(self):
        for kind in self.filtered('resolved_domain'):
            try:
                dom = safe_eval(kind.resolved_domain, {'activity_date': fields.Datetime.now()})
                assert isinstance(dom, list)
            except Exception as exc:  # noqa: BLE001
                raise ValidationError(_('Dominio de resolución inválido en «%s»: %s') % (kind.name, exc))

    # ------------------------------------------------------------------
    # Cierre automático (cron horario)
    # ------------------------------------------------------------------
    @api.model
    def _cron_auto_close(self):
        """Archiva en silencio: avisos caducados, actividades cuyo documento ya
        cumple el dominio de resolución y actividades cuyo documento se borró."""
        Activity = self.env['mail.activity'].sudo()
        now = fields.Datetime.now()
        closed = 0
        for kind in self.sudo().search([]):
            acts = Activity.search([('x_som_kind_id', '=', kind.id), ('active', '=', True)])
            if not acts:
                continue
            if kind.notice:
                days = kind.notice_days or 7
                limit = now - timedelta(days=days)
                stale = acts.filtered(lambda a: a.create_date and a.create_date <= limit)
                if stale:
                    stale._som_close_silently(_('Aviso archivado automáticamente a los %s días.') % days)
                    closed += len(stale)
                    acts -= stale
            closed += self._som_close_orphans(acts)
            acts = acts.filtered('active')
            if kind.resolved_domain and acts:
                closed += self._som_close_resolved(kind, acts)
        if closed:
            _logger.info('[som_activity_hub] cierre automático: %s actividad(es).', closed)
        return closed

    @api.model
    def _som_close_orphans(self, acts):
        closed = 0
        for res_model, model_acts in acts.filtered(lambda a: a.res_model and a.res_id).grouped('res_model').items():
            if res_model not in self.env:
                continue
            existing = set(self.env[res_model].sudo().with_context(active_test=False)
                           .browse(list(set(model_acts.mapped('res_id')))).exists().ids)
            orphans = model_acts.filtered(lambda a: a.res_id not in existing)
            if orphans:
                orphans._som_close_silently(_('El documento origen ya no existe.'))
                closed += len(orphans)
        return closed

    @api.model
    def _som_close_resolved(self, kind, acts):
        closed = 0
        feedback = kind.resolved_label or _('Resuelto: el documento ya no lo requiere.')
        per_activity = 'activity_date' in (kind.resolved_domain or '')
        for res_model, model_acts in acts.filtered(lambda a: a.res_model and a.res_id).grouped('res_model').items():
            if res_model not in self.env:
                continue
            Model = self.env[res_model].sudo().with_context(active_test=False)
            try:
                # Savepoint: un dominio que truene en SQL no deja la
                # transacción abortada para los demás tipos del cron.
                with self.env.cr.savepoint():
                    if per_activity:
                        resolved = model_acts.browse()
                        for act in model_acts:
                            domain = safe_eval(kind.resolved_domain, {'activity_date': act.create_date})
                            if Model.search_count([('id', '=', act.res_id)] + domain):
                                resolved |= act
                    else:
                        domain = safe_eval(kind.resolved_domain)
                        ids = set(Model.search([('id', 'in', list(set(model_acts.mapped('res_id'))))] + domain).ids)
                        resolved = model_acts.filtered(lambda a: a.res_id in ids)
            except Exception as exc:  # noqa: BLE001 — un dominio que no aplica a este modelo no tumba el cron
                _logger.debug('[som_activity_hub] dominio de «%s» no aplica a %s: %s', kind.name, res_model, exc)
                continue
            if resolved:
                resolved._som_close_silently(feedback)
                closed += len(resolved)
        return closed

    # ------------------------------------------------------------------
    # Clasificación
    # ------------------------------------------------------------------
    def _som_prefix_list(self):
        self.ensure_one()
        return [p.strip().lower() for p in (self.summary_prefixes or '').splitlines() if p.strip()]

    def _som_available_for(self, user):
        """¿Puede este usuario recibir/activar el tipo? Grupos listados → debe
        pertenecer a alguno (los xmlid de módulos no instalados se ignoran; si
        ninguno existe, no está disponible). Sin grupos → basta leer el modelo."""
        self.ensure_one()
        env_user = self.env(user=user.id)
        xmlids = [x.strip() for x in (self.group_xmlids or '').split(',') if x.strip()]
        if xmlids:
            for xmlid in xmlids:
                if env_user.ref(xmlid, raise_if_not_found=False) and env_user.user.has_group(xmlid):
                    return True
            return False
        if self.res_model and self.res_model in self.env:
            try:
                return env_user[self.res_model].has_access('read')
            except Exception:  # noqa: BLE001
                return False
        return True

    @api.model
    def _som_native_kind(self):
        return self.sudo().search([('key', '=', NATIVE_KEY)], limit=1)

    @api.model
    def _som_classify(self, res_model, summary):
        """Devuelve el tipo SOM que reconoce (modelo, resumen) o un recordset vacío.
        Gana el prefijo más largo; a igualdad, el tipo con modelo explícito.
        Las actividades manuales NO se clasifican: viven en el Centro como
        «Actividades manuales» pero siguen visibles en su documento."""
        summary = (summary or '').strip().lower()
        if not summary:
            return self.browse()
        domain = [('res_model', '=', False), ('summary_prefixes', '!=', False)]
        if res_model:
            domain = ['|', ('res_model', '=', res_model)] + domain
        best, best_len = self.browse(), -1
        for kind in self.sudo().search(domain):
            for prefix in kind._som_prefix_list():
                if summary.startswith(prefix):
                    score = len(prefix) * 2 + (1 if kind.res_model else 0)
                    if score > best_len:
                        best, best_len = kind, score
        return best

    @api.model
    def _som_reclassify_all(self):
        """Clasifica TODAS las actividades (activas y archivadas). Idempotente:
        se usa en instalación, migración y desde el botón del catálogo."""
        Activity = self.env['mail.activity'].sudo().with_context(active_test=False)
        activities = Activity.search([('summary', '!=', False)])
        touched = 0
        by_kind = {}
        for act in activities:
            kind = self._som_classify(act.res_model, act.summary)
            if act.x_som_kind_id != kind:
                by_kind.setdefault(kind.id or False, Activity.browse())
                by_kind[kind.id or False] |= act
        for kind_id, acts in by_kind.items():
            # Escritura directa: nada de bus ni de chatter por reclasificar.
            acts.with_context(mail_activity_quick_update=True).write({'x_som_kind_id': kind_id})
            touched += len(acts)
        _logger.info('[som_activity_hub] Reclasificadas %s actividad(es).', touched)
        return touched

    def action_reclassify_all(self):
        n = self._som_reclassify_all()
        return {
            'type': 'ir.actions.client', 'tag': 'display_notification',
            'params': {'type': 'success', 'sticky': False,
                       'message': _('%s actividad(es) reclasificadas.') % n},
        }


class SomActivityPref(models.Model):
    _name = 'som.activity.pref'
    _description = 'Preferencia de actividades SOM por usuario'
    _rec_name = 'kind_id'

    user_id = fields.Many2one('res.users', required=True, index=True, ondelete='cascade')
    kind_id = fields.Many2one('som.activity.kind', required=True, index=True, ondelete='cascade')
    enabled = fields.Boolean('Recibir', default=True)

    _user_kind_unique = models.Constraint('UNIQUE(user_id, kind_id)', 'Solo una preferencia por usuario y tipo.')

    @api.model
    def _som_disabled_kind_ids(self, user=None):
        user = user or self.env.user
        return self.sudo().search([('user_id', '=', user.id), ('enabled', '=', False)]).kind_id.ids


class MailActivity(models.Model):
    _inherit = 'mail.activity'

    x_som_kind_id = fields.Many2one(
        'som.activity.kind', string='Tipo SOM', index=True, ondelete='set null',
        help="Tipo del Centro de Actividades SOM. Vacío = actividad nativa (relojito).")
    x_som_hub = fields.Boolean('Vive en el Centro SOM', compute='_compute_x_som_hub')

    @api.depends('x_som_kind_id')
    def _compute_x_som_hub(self):
        for act in self:
            act.x_som_hub = bool(act.x_som_kind_id)

    def _to_store_defaults(self, target):
        # El webclient (popover de actividades de listas/kanban/form) filtra
        # con esta bandera para no volver a pintar lo que ya vive en el Centro.
        return super()._to_store_defaults(target) + ['x_som_hub']

    @api.model_create_multi
    def create(self, vals_list):
        Kind = self.env['som.activity.kind']
        IrModel = self.env['ir.model'].sudo()
        for vals in vals_list:
            if vals.get('x_som_kind_id') or not vals.get('summary'):
                continue
            res_model = vals.get('res_model')
            if not res_model and vals.get('res_model_id'):
                res_model = IrModel.browse(vals['res_model_id']).model
            kind = Kind._som_classify(res_model, vals.get('summary'))
            if kind:
                vals['x_som_kind_id'] = kind.id
        return super().create(vals_list)

    @api.model
    def _search(self, domain, offset=0, limit=None, order=None, *, bypass_access=False, **kwargs):
        # Relojito del systray: fuera las actividades del Centro SOM.
        if self.env.context.get(CTX_SYSTRAY_EXCLUDE):
            domain = Domain(domain) & Domain('x_som_kind_id', '=', False)
        return super()._search(domain, offset, limit, order, bypass_access=bypass_access, **kwargs)

    def action_notify(self):
        # Sin duplicados: asignar una actividad (SOM o manual) NO manda el
        # aviso nativo "te asignaron una actividad" (correo + bandeja de
        # mensajes). Todas viven únicamente en el Centro de Actividades.
        return None

    def _som_sibling_activities(self):
        """Actividades hermanas: mismo documento + mismo tipo SOM compartido,
        vivas, de OTROS usuarios (o del mismo, si hubiera duplicados)."""
        siblings = self.env['mail.activity'].sudo()
        for act in self.filtered(lambda a: a.x_som_kind_id.shared and a.res_model and a.res_id):
            siblings |= siblings.search([
                ('id', 'not in', self.ids),
                ('res_model', '=', act.res_model),
                ('res_id', '=', act.res_id),
                ('x_som_kind_id', '=', act.x_som_kind_id.id),
                ('active', '=', True),
            ])
        return siblings

    def _som_close_silently(self, feedback):
        """Archiva sin mensaje en el chatter: quien resolvió ya dejó el suyo."""
        if not self:
            return
        self.sudo().with_context(mail_activity_quick_update=True).write({
            'active': False,
            'feedback': feedback,
        })

    def _action_done(self, feedback=False, attachment_ids=None):
        siblings = self._som_sibling_activities()
        res = super()._action_done(feedback=feedback, attachment_ids=attachment_ids)
        if siblings:
            siblings._som_close_silently(_('Atendida por %s') % self.env.user.name)
        return res


class MailActivityMixin(models.AbstractModel):
    """Los resúmenes nativos del registro (columna "Actividades" de las
    listas, íconos de kanban/form, decoración de estado) se calculan SOLO con
    las actividades nativas. `activity_ids` NO se toca: el código de los
    módulos sigue viendo y cerrando sus actividades SOM ahí."""
    _inherit = 'mail.activity.mixin'

    # OJO: Odoo fusiona los kwargs de la definición del core (related=...,
    # readonly=False) con los de aquí; sin `related=None, readonly=True`
    # explícitos el campo seguiría siendo related y el compute jamás correría.
    activity_type_id = fields.Many2one(
        'mail.activity.type', 'Next Activity Type',
        related=None, readonly=True,
        compute='_som_compute_next_activity', search='_search_activity_type_id',
        groups="base.group_user")
    activity_type_icon = fields.Char(
        'Activity Type Icon', related=None, readonly=True, compute='_som_compute_next_activity')
    activity_summary = fields.Char(
        'Next Activity Summary',
        related=None, readonly=True,
        compute='_som_compute_next_activity', search='_search_activity_summary',
        groups="base.group_user")

    def _som_native_activities(self):
        self.ensure_one()
        return self.activity_ids.filtered(lambda a: not a.x_som_kind_id)

    @api.depends('activity_ids.activity_type_id', 'activity_ids.summary', 'activity_ids.x_som_kind_id')
    def _som_compute_next_activity(self):
        for record in self:
            first = record._som_native_activities()[:1]
            record.activity_type_id = first.activity_type_id
            record.activity_type_icon = first.activity_type_id.icon
            record.activity_summary = first.summary

    @api.depends('activity_ids.activity_type_id.decoration_type', 'activity_ids.activity_type_id.icon',
                 'activity_ids.x_som_kind_id')
    def _compute_activity_exception_type(self):
        self.mapped('activity_ids.activity_type_id.decoration_type')
        for record in self:
            exception_type = False
            for activity_type in record._som_native_activities().mapped('activity_type_id'):
                if activity_type.decoration_type == 'danger':
                    exception_type = activity_type
                    break
                if activity_type.decoration_type == 'warning':
                    exception_type = activity_type
            record.activity_exception_decoration = exception_type and exception_type.decoration_type
            record.activity_exception_icon = exception_type and exception_type.icon

    @api.depends('activity_ids.user_id', 'activity_ids.x_som_kind_id')
    def _compute_activity_user_id(self):
        for record in self:
            acts = record._som_native_activities()
            record.activity_user_id = acts[0].user_id if acts else False

    @api.depends('activity_ids.state', 'activity_ids.x_som_kind_id')
    def _compute_activity_state(self):
        for record in self:
            states = record._som_native_activities().mapped('state')
            if 'overdue' in states:
                record.activity_state = 'overdue'
            elif 'today' in states:
                record.activity_state = 'today'
            elif 'planned' in states:
                record.activity_state = 'planned'
            else:
                record.activity_state = False

    @api.depends('activity_ids.date_deadline', 'activity_ids.x_som_kind_id')
    def _compute_activity_date_deadline(self):
        for record in self:
            acts = record._som_native_activities()
            record.activity_date_deadline = acts[:1].date_deadline

    @api.depends('activity_ids.date_deadline', 'activity_ids.user_id', 'activity_ids.x_som_kind_id')
    @api.depends_context('uid')
    def _compute_my_activity_date_deadline(self):
        for record in self:
            record.my_activity_date_deadline = next((
                a.date_deadline for a in record._som_native_activities()
                if a.user_id.id == record.env.uid
            ), False)


class MailThread(models.AbstractModel):
    """El chatter pide las actividades del registro por `request_list`
    ("activities"): se entregan solo las nativas; las SOM viven en el Centro."""
    _inherit = 'mail.thread'

    def _thread_to_store(self, store, fields, *, request_list=None):
        if (
            request_list and "activities" in request_list
            and isinstance(self.env[self._name], self.env.registry["mail.activity.mixin"])
        ):
            trimmed = [r for r in request_list if r != "activities"]
            res = super()._thread_to_store(store, fields, request_list=trimmed)
            for thread in self:
                acts = thread.with_context(active_test=True).activity_ids.filtered(lambda a: not a.x_som_kind_id)
                store.add(thread, {"activities": Store.Many(acts)}, as_thread=True)
            return res
        return super()._thread_to_store(store, fields, request_list=request_list)


class ResUsers(models.Model):
    _inherit = 'res.users'

    @api.model
    def _get_activity_groups(self):
        return super(ResUsers, self.with_context(**{CTX_SYSTRAY_EXCLUDE: True}))._get_activity_groups()


class SomActivityHub(models.AbstractModel):
    """RPC del Centro de Actividades. Todo corre con los permisos del usuario
    sobre SUS actividades; el sudo solo se usa para leer nombres/estados de
    documentos y para ver a quién más está asignada una actividad compartida."""
    _name = 'som.activity.hub'
    _description = 'Centro de Actividades SOM'

    HISTORY_LIMIT = 150
    NOTE_MAX = 320

    # ------------------------------------------------------------------
    # Helpers de serialización
    # ------------------------------------------------------------------
    @api.model
    def _kind_payload(self, kind):
        if not kind:
            kind = self.env['som.activity.kind']._som_native_kind()
        if not kind:
            return {'id': 0, 'key': NATIVE_KEY, 'name': _('Actividades manuales'), 'category': 'manual',
                    'category_label': dict(CATEGORIES)['manual'], 'icon': 'fa-clock-o', 'color': '#5a6b7d',
                    'shared': False, 'notice': False, 'notice_days': 7, 'auto': False, 'description': ''}
        return {
            'id': kind.id,
            'key': kind.key,
            'name': kind.name,
            'category': kind.category,
            'category_label': dict(CATEGORIES).get(kind.category, kind.category),
            'icon': kind.icon or 'fa-bell',
            'color': kind.color or '#0b57d0',
            'shared': kind.shared,
            'notice': kind.notice,
            'notice_days': kind.notice_days or 7,
            'auto': bool(kind.resolved_domain),
            'description': kind.description or '',
        }

    @api.model
    def _record_info(self, res_model, res_id):
        """Nombre y estado del documento origen (sudo: el usuario tiene la
        actividad, aunque no siempre acceso al documento)."""
        info = {'res_name': '', 'res_state': '', 'model_label': ''}
        if not res_model or res_model not in self.env or not res_id:
            return info
        try:
            Model = self.env[res_model].sudo()
            info['model_label'] = Model._description or res_model
            rec = Model.browse(res_id).exists()
            if not rec:
                info['res_name'] = _('(documento eliminado)')
                return info
            info['res_name'] = rec.display_name or ''
            field = rec._fields.get('state')
            if field and field.type == 'selection':
                info['res_state'] = dict(field._description_selection(self.env)).get(rec.state, rec.state or '')
        except Exception:  # noqa: BLE001 — jamás tumbar el hub por un documento raro
            _logger.debug('[som_activity_hub] no se pudo leer %s,%s', res_model, res_id, exc_info=True)
        return info

    @api.model
    def _done_stamp(self, act):
        """date_done es Date en Odoo 19; la hora real del cierre es write_date."""
        if act.active or not act.date_done:
            return ''
        stamp = act.write_date if (act.write_date and act.write_date.date() >= act.date_done) else None
        if stamp:
            return fields.Datetime.context_timestamp(self, stamp).strftime('%Y-%m-%d %H:%M')
        return act.date_done.strftime('%Y-%m-%d')

    @api.model
    def _note_text(self, note):
        text = html2plaintext(note or '').strip()
        text = re.sub(r'\s+', ' ', text)
        if len(text) > self.NOTE_MAX:
            text = text[:self.NOTE_MAX - 1].rstrip() + '…'
        return text

    @api.model
    def _activity_payload(self, act, with_siblings=True):
        kind = act.x_som_kind_id
        info = self._record_info(act.res_model, act.res_id)
        today = fields.Date.context_today(self)
        created = fields.Datetime.context_timestamp(self, act.create_date) if act.create_date else None
        deadline = act.date_deadline
        payload = {
            'id': act.id,
            'kind': self._kind_payload(kind),
            'summary': act.summary or '',
            'note': self._note_text(act.note),
            'res_model': act.res_model or '',
            'res_id': act.res_id or 0,
            'res_name': info['res_name'] or act.res_name or '',
            'res_state': info['res_state'],
            'model_label': info['model_label'],
            'user_id': act.user_id.id,
            'user_name': act.user_id.name or '',
            'requester': act.create_uid.name or '',
            'requester_id': act.create_uid.id,
            'created_at': created.strftime('%Y-%m-%d %H:%M') if created else '',
            'days_open': (today - act.create_date.date()).days if act.create_date else 0,
            'deadline': deadline.isoformat() if deadline else '',
            'days_late': (today - deadline).days if deadline and act.active else 0,
            'state': act.state if act.active else 'done',
            'active': act.active,
            'feedback': act.feedback or '',
            'done_at': self._done_stamp(act),
            'closed_by': act.write_uid.name if (not act.active and act.write_uid) else '',
            'co_assignees': [],
        }
        if with_siblings and kind and kind.shared and act.res_model and act.res_id:
            others = self.env['mail.activity'].sudo().search([
                ('id', '!=', act.id),
                ('res_model', '=', act.res_model),
                ('res_id', '=', act.res_id),
                ('x_som_kind_id', '=', kind.id),
                ('active', '=', True),
            ])
            payload['co_assignees'] = sorted({u.name for u in others.user_id if u.name})
        return payload

    # ------------------------------------------------------------------
    # RPC
    # ------------------------------------------------------------------
    @api.model
    def get_data(self):
        user = self.env.user
        Activity = self.env['mail.activity']
        Kind = self.env['som.activity.kind'].sudo()
        native = Kind._som_native_kind()
        native_id = native.id or 0
        disabled = set(self.env['som.activity.pref']._som_disabled_kind_ids(user))
        all_kinds = Kind.search([])
        available = {k.id: k._som_available_for(user) for k in all_kinds}

        def kind_id_of(act):
            return act.x_som_kind_id.id or native_id

        def visible(act):
            kid = kind_id_of(act)
            return kid not in disabled and available.get(kid, True)

        # TODAS las actividades del usuario: las SOM y las manuales.
        base = [('user_id', '=', user.id)]
        pending_all = Activity.search(base + [('active', '=', True)], order='date_deadline asc, id desc')
        pending = pending_all.filtered(visible)

        history = Activity.with_context(active_test=False).search(
            base + [('active', '=', False)], order='date_done desc, write_date desc, id desc', limit=self.HISTORY_LIMIT)
        history = history.filtered(visible)

        # Lo que YO pedí y otros deben atender (o ya atendieron).
        mine_domain = [('create_uid', '=', user.id), ('user_id', '!=', user.id)]
        requested_open = Activity.sudo().search(mine_domain + [('active', '=', True)],
                                                order='id desc', limit=self.HISTORY_LIMIT)
        requested_closed = Activity.sudo().with_context(active_test=False).search(
            mine_domain + [('active', '=', False)], order='date_done desc, write_date desc, id desc', limit=self.HISTORY_LIMIT)
        requests = self._group_requests(requested_open, requested_closed)

        # Catálogo para configurar: todos los tipos, con cuántas tiene el usuario.
        counts = {}
        for act in pending_all:
            counts[kind_id_of(act)] = counts.get(kind_id_of(act), 0) + 1
        ever = {
            (kind.id or native_id): count
            for kind, count in Activity.sudo().with_context(active_test=False)._read_group(
                [('user_id', '=', user.id)], ['x_som_kind_id'], ['__count'])
        }
        kinds = []
        # Sin permiso = no existe para el usuario: no se lista (ni con candado).
        for kind in all_kinds.filtered(lambda k: available.get(k.id, True)):
            kp = self._kind_payload(kind)
            kp.update({
                'enabled': kind.id not in disabled and available.get(kind.id, True),
                'available': available.get(kind.id, True),
                'pending_count': counts.get(kind.id, 0),
                'ever_count': ever.get(kind.id, 0),
            })
            kinds.append(kp)

        return {
            'user': {'id': user.id, 'name': user.name},
            'today': fields.Date.context_today(self).isoformat(),
            'pending': [self._activity_payload(a) for a in pending],
            'hidden_pending': len(pending_all) - len(pending),
            'native_kind_id': native_id,
            'history': [self._activity_payload(a, with_siblings=False) for a in history],
            'requests': requests,
            'kinds': kinds,
            'categories': [{'key': k, 'label': v} for k, v in CATEGORIES],
        }

    @api.model
    def _group_requests(self, open_acts, closed_acts):
        """Una solicitud = (documento, tipo). Junta a los asignados y, si ya
        se cerró, quién la atendió y cuándo."""
        groups = {}

        def key_of(a):
            return (a.res_model, a.res_id, a.x_som_kind_id.id or 0)

        for act in open_acts:
            g = groups.setdefault(key_of(act), self._request_seed(act))
            g['waiting_on'].append(act.user_id.name or '')
            g['status'] = 'open'
        for act in closed_acts:
            k = key_of(act)
            if k in groups and groups[k]['status'] == 'open':
                continue  # aún abierta para alguien: manda lo pendiente
            g = groups.setdefault(k, self._request_seed(act))
            if not g['resolved_by'] or act.write_uid == act.user_id:
                g['resolved_by'] = act.write_uid.name or ''
                g['resolved_at'] = self._done_stamp(act)
                g['feedback'] = act.feedback or ''
            g['status'] = 'closed'
        out = list(groups.values())
        for g in out:
            g['waiting_on'] = sorted(set(g['waiting_on']))
        opened = sorted((g for g in out if g['status'] == 'open'), key=lambda g: g['created_at'], reverse=True)
        closed = sorted((g for g in out if g['status'] != 'open'), key=lambda g: g['resolved_at'], reverse=True)
        return (opened + closed)[: self.HISTORY_LIMIT]

    @api.model
    def _request_seed(self, act):
        p = self._activity_payload(act, with_siblings=False)
        return {
            'key': '%s,%s,%s' % (act.res_model, act.res_id, act.x_som_kind_id.id or 0),
            'kind': p['kind'],
            'summary': p['summary'],
            'res_model': p['res_model'],
            'res_id': p['res_id'],
            'res_name': p['res_name'],
            'res_state': p['res_state'],
            'created_at': p['created_at'],
            'days_open': p['days_open'],
            'waiting_on': [],
            'resolved_by': '',
            'resolved_at': '',
            'feedback': '',
            'status': 'open',
        }

    @api.model
    def mark_done(self, activity_ids, feedback=None):
        acts = self.env['mail.activity'].browse(activity_ids).exists()
        if any(a.user_id != self.env.user for a in acts):
            raise AccessError(_('Solo puedes atender actividades asignadas a ti.'))
        if not acts:
            return {'closed': 0}
        # Mismo camino que el botón "Marcar hecha" del chatter: la actividad
        # es del usuario, así que Odoo le permite archivarla.
        acts.action_feedback(feedback=(feedback or '').strip() or False)
        return {'closed': len(acts)}

    @api.model
    def set_pref(self, kind_id, enabled):
        kind = self.env['som.activity.kind'].browse(int(kind_id)).exists()
        if not kind:
            raise UserError(_('El tipo de actividad ya no existe.'))
        if enabled and not kind._som_available_for(self.env.user):
            raise UserError(_('No tienes permiso para recibir «%s».') % kind.name)
        Pref = self.env['som.activity.pref'].sudo()
        pref = Pref.search([('user_id', '=', self.env.uid), ('kind_id', '=', kind.id)], limit=1)
        if pref:
            pref.enabled = bool(enabled)
        else:
            Pref.create({'user_id': self.env.uid, 'kind_id': kind.id, 'enabled': bool(enabled)})
        return True

    @api.model
    def set_all_prefs(self, enabled):
        Pref = self.env['som.activity.pref'].sudo()
        existing = {p.kind_id.id: p for p in Pref.search([('user_id', '=', self.env.uid)])}
        for kind in self.env['som.activity.kind'].sudo().search([]):
            value = bool(enabled) and kind._som_available_for(self.env.user)
            pref = existing.get(kind.id)
            if pref:
                pref.enabled = value
            else:
                Pref.create({'user_id': self.env.uid, 'kind_id': kind.id, 'enabled': value})
        return True
