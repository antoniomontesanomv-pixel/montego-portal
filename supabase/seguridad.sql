-- Seguridad y trazabilidad (07/10/2026). Ejecutar en Supabase > SQL Editor después de schema.sql.
-- Se puede repetir sin problema.

-- ============ 1. Registro de auditoría ============
-- Cada alta, cambio o borrado en las tablas de la obra queda guardado con quién, cuándo, antes y después.
-- Nadie puede modificarlo ni borrarlo desde el portal; solo el administrativo lo consulta.
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario uuid,
  correo text,
  tabla text not null,
  accion text not null check (accion in ('insert','update','delete')),
  clave text,
  antes jsonb,
  despues jsonb
);
create index if not exists auditoria_fecha on public.auditoria (fecha desc);
alter table public.auditoria enable row level security;
drop policy if exists admin_ve on public.auditoria;
create policy admin_ve on public.auditoria for select using (es_admin());
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

create or replace function public.auditar() returns trigger language plpgsql security definer set search_path = public as
$$ declare a jsonb; d jsonb; r jsonb;
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and a = d then return new; end if;
  r := coalesce(d, a);
  insert into auditoria(usuario, correo, tabla, accion, clave, antes, despues)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), tg_table_name, lower(tg_op),
          coalesce(r->>'id', concat_ws(' / ', r->>'obra_id', r->>'item', r->>'email')), a, d);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['clientes','invitaciones','perfiles','obras','obra_equipo','obra_lineas','obra_precios','avances','bitacora','ordenes'] loop
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;

-- ============ 2. Órdenes decididas no se editan ============
-- Una OS aprobada o rechazada ya no se puede modificar. Solo el administrativo puede eliminarla
-- (queda copia completa en auditoría).
create or replace function public.proteger_orden() returns trigger language plpgsql security definer set search_path = public as
$$ begin
  if tg_op = 'DELETE' then
    if old.estado <> 'pendiente' and not es_admin() and auth.uid() is not null then
      raise exception 'Solo el administrativo puede eliminar la orden %', old.numero;
    end if;
    return old;
  end if;
  if old.estado <> 'pendiente' then
    raise exception 'La orden % ya fue % y no se puede modificar', old.numero, old.estado;
  end if;
  return new;
end $$;
drop trigger if exists proteger_orden on public.ordenes;
create trigger proteger_orden before update or delete on public.ordenes for each row execute function public.proteger_orden();

-- ============ 3. El registro de interacciones dice la verdad ============
-- El lado (cliente, Montego, campo) y el autor de cada evento los pone la base según quién está conectado.
create or replace function public.firmar_evento() returns trigger language plpgsql security definer set search_path = public as
$$ declare rol text;
begin
  if auth.uid() is null then return new; end if;
  select p.rol into rol from perfiles p where p.id = auth.uid();
  new.por := auth.uid();
  new.lado := case rol when 'admin' then 'montego' when 'campo' then 'campo' when 'cliente' then 'cliente' else 'sistema' end;
  new.fecha := now();
  return new;
end $$;
drop trigger if exists firmar_evento on public.eventos;
create trigger firmar_evento before insert on public.eventos for each row execute function public.firmar_evento();

-- Lo mismo para avance y bitácora: el autor y la hora los pone la base.
create or replace function public.firmar_autor() returns trigger language plpgsql as
$$ begin
  if auth.uid() is not null then new.por := auth.uid(); end if;
  if tg_table_name = 'avances' then new.actualizado := now(); else new.creada := now(); end if;
  return new;
end $$;
drop trigger if exists firmar_autor on public.avances;
create trigger firmar_autor before insert or update on public.avances for each row execute function public.firmar_autor();
drop trigger if exists firmar_autor on public.bitacora;
create trigger firmar_autor before insert on public.bitacora for each row execute function public.firmar_autor();

-- ============ 4. Nadie anónimo toca nada ============
revoke all on all tables in schema public from anon;
