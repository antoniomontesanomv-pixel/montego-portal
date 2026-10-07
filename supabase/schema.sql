-- Portal de obra Montego · esquema y permisos (Supabase / Postgres)
-- Ejecutar completo en Supabase > SQL Editor > New query. Se puede volver a ejecutar sin perder datos.

-- ============ Tablas ============
create table if not exists public.clientes (
  id text primary key,                 -- CLI-001 (código del APU)
  razon_social text not null,
  rif text
);

-- Quién puede entrar y con qué rol. Montego da de alta el correo; al entrar por primera vez se crea su perfil.
create table if not exists public.invitaciones (
  email text primary key,
  rol text not null check (rol in ('admin','campo','cliente')),
  cliente_id text references public.clientes(id),
  nombre text,
  creada timestamptz default now()
);

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null check (rol in ('admin','campo','cliente')),
  cliente_id text references public.clientes(id),
  activo boolean not null default true
);

create table if not exists public.obras (
  id text primary key,                 -- mtg-2026-001
  codigo text not null,                -- MTG-2026-001 (número de propuesta del APU)
  nombre text not null,
  cliente_id text not null references public.clientes(id),
  ubicacion text,
  fecha_inicio date,
  plazo_dias int default 0,
  estado text not null default 'por_iniciar' check (estado in ('por_iniciar','en_ejecucion','pausada','terminada')),
  iva_pct numeric default 16,
  contingencia_pct numeric default 0,
  responsable text,
  actualizado date default current_date
);

-- Líderes de campo asignados a cada obra (por correo, así se asignan antes de su primer acceso)
create table if not exists public.obra_equipo (
  obra_id text references public.obras(id) on delete cascade,
  email text not null,
  primary key (obra_id, email)
);

-- Línea base congelada desde el APU. Sin precio: el precio vive aparte para que campo nunca lo reciba.
create table if not exists public.obra_lineas (
  obra_id text references public.obras(id) on delete cascade,
  item text not null,
  wbs text,
  cod_cliente text,
  cod_covenin text,
  partida_id text,
  descripcion text not null,
  unidad text,
  cantidad numeric not null default 0,
  orden int default 0,
  primary key (obra_id, item)
);

create table if not exists public.obra_precios (
  obra_id text,
  item text,
  pu numeric not null,
  primary key (obra_id, item),
  foreign key (obra_id, item) references public.obra_lineas(obra_id, item) on delete cascade
);

-- Cantidad ejecutada acumulada por ítem (incluye ítems nacidos de órdenes: OS-002.1)
create table if not exists public.avances (
  obra_id text references public.obras(id) on delete cascade,
  item text not null,
  cantidad numeric not null default 0,
  por uuid references public.perfiles(id),
  actualizado timestamptz default now(),
  primary key (obra_id, item)
);

create table if not exists public.bitacora (
  id bigint generated always as identity primary key,
  obra_id text references public.obras(id) on delete cascade,
  fecha date not null default current_date,
  texto text not null,
  fotos int default 0,
  por uuid references public.perfiles(id),
  creada timestamptz default now()
);

create table if not exists public.ordenes (
  id text primary key,                 -- mtg-2026-001-os-002
  obra_id text not null references public.obras(id) on delete cascade,
  numero text not null,                -- OS-002
  fecha date not null default current_date,
  titulo text not null,
  motivo text,
  lineas jsonb not null default '[]',  -- [{tipo, item_ref, cod_cliente, descripcion, unidad, cantidad, pu, wbs}]
  impacto_plazo_dias int default 0,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  decision_por uuid references public.perfiles(id),
  decision_fecha timestamptz,
  decision_comentario text,
  emitida_por uuid references public.perfiles(id),
  unique (obra_id, numero)
);

create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  obra_id text references public.obras(id) on delete cascade,
  fecha timestamptz default now(),
  lado text not null check (lado in ('cliente','montego','campo','sistema')),
  texto text not null,
  por uuid references public.perfiles(id)
);

-- Catálogo de partidas del APU (precio de referencia) para armar órdenes. Solo administrativo.
create table if not exists public.catalogo (
  id text primary key,
  cod text,
  descripcion text not null,
  unidad text,
  pu numeric,
  seccion text
);

-- ============ Funciones de permisos ============
create or replace function public.mi_rol() returns text language sql stable security definer set search_path = public as
$$ select rol from perfiles where id = auth.uid() and activo $$;

create or replace function public.es_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(mi_rol() = 'admin', false) $$;

create or replace function public.ve_obra(o text) returns boolean language sql stable security definer set search_path = public as
$$ select es_admin()
     or exists (select 1 from perfiles p join obras ob on ob.cliente_id = p.cliente_id
                where p.id = auth.uid() and p.activo and p.rol = 'cliente' and ob.id = o)
     or exists (select 1 from obra_equipo e join perfiles p on lower(p.email) = lower(e.email)
                where p.id = auth.uid() and p.activo and p.rol = 'campo' and e.obra_id = o) $$;

create or replace function public.ve_precios(o text) returns boolean language sql stable security definer set search_path = public as
$$ select es_admin() or (mi_rol() = 'cliente' and ve_obra(o)) $$;

create or replace function public.carga_avance(o text) returns boolean language sql stable security definer set search_path = public as
$$ select es_admin() or (mi_rol() = 'campo' and ve_obra(o)) $$;

-- Al crearse un usuario (primer acceso por correo) se le asigna el rol de su invitación.
create or replace function public.nuevo_usuario() returns trigger language plpgsql security definer set search_path = public as
$$ declare inv invitaciones%rowtype;
begin
  select * into inv from invitaciones where lower(email) = lower(new.email);
  if found then
    insert into perfiles(id, email, nombre, rol, cliente_id)
    values (new.id, new.email, inv.nombre, inv.rol, inv.cliente_id)
    on conflict (id) do update set rol = excluded.rol, cliente_id = excluded.cliente_id, nombre = coalesce(excluded.nombre, perfiles.nombre);
  end if;
  return new;
end $$;
drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users for each row execute function public.nuevo_usuario();

-- Si la invitación se crea o cambia después de que la persona ya entró, se actualiza su perfil.
create or replace function public.sync_invitacion() returns trigger language plpgsql security definer set search_path = public as
$$ declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(new.email);
  if uid is not null then
    insert into perfiles(id, email, nombre, rol, cliente_id) values (uid, new.email, new.nombre, new.rol, new.cliente_id)
    on conflict (id) do update set rol = excluded.rol, cliente_id = excluded.cliente_id, nombre = coalesce(excluded.nombre, perfiles.nombre), activo = true;
  end if;
  return new;
end $$;
drop trigger if exists al_invitar on public.invitaciones;
create trigger al_invitar after insert or update on public.invitaciones for each row execute function public.sync_invitacion();

-- El cliente decide una orden solo por aquí: no puede tocar montos ni órdenes ya decididas.
create or replace function public.decidir_orden(oid text, aprobar boolean, comentario text) returns void
language plpgsql security definer set search_path = public as
$$ declare o ordenes%rowtype; monto numeric;
begin
  select * into o from ordenes where id = oid for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not (mi_rol() in ('cliente','admin') and ve_obra(o.obra_id)) then raise exception 'Sin permiso para decidir esta orden'; end if;
  if o.estado <> 'pendiente' then raise exception 'Esta orden ya fue decidida'; end if;
  if not aprobar and coalesce(trim(comentario),'') = '' then raise exception 'Indique el motivo del rechazo'; end if;
  update ordenes set estado = case when aprobar then 'aprobada' else 'rechazada' end,
    decision_por = auth.uid(), decision_fecha = now(), decision_comentario = nullif(trim(comentario),'')
  where id = oid;
  select coalesce(sum((case when l->>'tipo' = 'disminucion' then -1 else 1 end) * (l->>'cantidad')::numeric * (l->>'pu')::numeric),0)
    into monto from jsonb_array_elements(o.lineas) l;
  insert into eventos(obra_id, lado, texto, por) values (o.obra_id, 'cliente',
    (case when aprobar then 'Aprobó ' else 'Rechazó ' end) || o.numero || ' (' || to_char(monto,'FM999G999G990D00') || ' US$)'
    || coalesce(': “' || nullif(trim(comentario),'') || '”',''), auth.uid());
end $$;

-- Campo recibe las órdenes sin precios (para saber qué cantidades cambian y qué no ejecutar).
create or replace function public.ordenes_campo(o text) returns table(id text, numero text, fecha date, titulo text, estado text, impacto_plazo_dias int, lineas jsonb)
language sql stable security definer set search_path = public as
$$ select r.id, r.numero, r.fecha, r.titulo, r.estado, r.impacto_plazo_dias,
     coalesce((select jsonb_agg(l - 'pu') from jsonb_array_elements(r.lineas) l), '[]'::jsonb)
   from ordenes r where r.obra_id = o and carga_avance(o) $$;

-- ============ Seguridad por filas ============
alter table public.clientes enable row level security;
alter table public.invitaciones enable row level security;
alter table public.perfiles enable row level security;
alter table public.obras enable row level security;
alter table public.obra_equipo enable row level security;
alter table public.obra_lineas enable row level security;
alter table public.obra_precios enable row level security;
alter table public.avances enable row level security;
alter table public.bitacora enable row level security;
alter table public.ordenes enable row level security;
alter table public.eventos enable row level security;
alter table public.catalogo enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy admin_todo on public.clientes for all using (es_admin()) with check (es_admin());
create policy cliente_ve_suyo on public.clientes for select using (id = (select cliente_id from perfiles where id = auth.uid()));

create policy admin_todo on public.invitaciones for all using (es_admin()) with check (es_admin());

create policy admin_todo on public.perfiles for all using (es_admin()) with check (es_admin());
create policy ve_su_perfil on public.perfiles for select using (id = auth.uid());

create policy admin_todo on public.obras for all using (es_admin()) with check (es_admin());
create policy ve_obra on public.obras for select using (ve_obra(id));

create policy admin_todo on public.obra_equipo for all using (es_admin()) with check (es_admin());
create policy ve_su_equipo on public.obra_equipo for select using (lower(email) = lower((select email from perfiles where id = auth.uid())));

create policy admin_todo on public.obra_lineas for all using (es_admin()) with check (es_admin());
create policy ve_lineas on public.obra_lineas for select using (ve_obra(obra_id));

create policy admin_todo on public.obra_precios for all using (es_admin()) with check (es_admin());
create policy ve_precios on public.obra_precios for select using (ve_precios(obra_id));

create policy ve_avance on public.avances for select using (ve_obra(obra_id));
create policy carga_avance on public.avances for insert with check (carga_avance(obra_id));
create policy corrige_avance on public.avances for update using (carga_avance(obra_id)) with check (carga_avance(obra_id));

create policy ve_bitacora on public.bitacora for select using (ve_obra(obra_id));
create policy escribe_bitacora on public.bitacora for insert with check (carga_avance(obra_id));
create policy admin_borra on public.bitacora for delete using (es_admin());

create policy admin_todo on public.ordenes for all using (es_admin()) with check (es_admin());
create policy cliente_ve on public.ordenes for select using (mi_rol() = 'cliente' and ve_obra(obra_id));

create policy admin_ve on public.eventos for select using (es_admin());
create policy registra on public.eventos for insert with check (ve_obra(obra_id) and por = auth.uid());
create policy admin_borra on public.eventos for delete using (es_admin());

create policy admin_todo on public.catalogo for all using (es_admin()) with check (es_admin());

-- ============ Tiempo real ============
do $$ declare t text; begin
  foreach t in array array['obras','obra_lineas','obra_precios','avances','bitacora','ordenes','eventos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
