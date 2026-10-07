-- Acceso con correo y clave (07/10/2026). Ejecutar una vez en Supabase > SQL Editor. Se puede repetir sin problema.
alter table public.invitaciones add column if not exists codigo text;

-- Solo se crean cuentas de correos invitados y con el código correcto (si la invitación tiene código).
create or replace function public.validar_alta() returns trigger language plpgsql security definer set search_path = public as
$$ declare inv invitaciones%rowtype;
begin
  select * into inv from invitaciones where lower(email) = lower(new.email);
  if not found then raise exception 'Correo no registrado en Montego'; end if;
  if inv.codigo is not null and inv.codigo <> coalesce(new.raw_user_meta_data->>'codigo', '') then
    raise exception 'Código de invitación incorrecto';
  end if;
  return new;
end $$;
drop trigger if exists antes_crear_usuario on auth.users;
create trigger antes_crear_usuario before insert on auth.users for each row execute function public.validar_alta();
