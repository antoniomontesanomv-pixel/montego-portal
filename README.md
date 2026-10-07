# Portal de obra Montego

Página de inicio con acceso por correo (sin contraseña) y tres vistas según el rol:

- **Cliente**: avance de sus obras, monto vigente con la reserva de contingencia, aprobación o rechazo de órdenes de servicio, bitácora.
- **Administrativo**: gestión de la obra, emisión de órdenes desde el catálogo del APU, carga de avance, registro de interacciones, accesos de clientes y líderes de campo, carga de obras desde el APU. También puede ver la vista de campo y la del cliente.
- **Líder de campo**: carga de avance y bitácora solo con cantidades; ve qué órdenes están pendientes para no ejecutarlas. Nunca recibe precios.

Sitio estático (HTML + JS, sin compilación) publicado en Cloudflare Pages. Datos, acceso y permisos en Supabase: las reglas de `supabase/schema.sql` deciden qué ve cada rol, no la página.

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html` | Inicio, acceso y contenedor de las vistas |
| `assets/app.js` | Lógica y vistas |
| `assets/styles.css` | Estilos (fondo blanco, partidas en gris, detalles en azul) |
| `assets/config.js` | Dirección y clave pública de Supabase |
| `supabase/schema.sql` | Tablas, funciones y permisos por rol |
| `supabase/seed.sql` | Obra de ejemplo MTG-2026-001 (opcional) |
| `supabase/catalogo.sql` | Catálogo de partidas del APU con precio de referencia |

## Puesta en marcha

### 1. Supabase
1. Crear un proyecto en https://supabase.com (región más cercana: East US).
2. SQL Editor > New query: pegar y ejecutar `supabase/schema.sql`. Luego `supabase/catalogo.sql` y, si se quiere la obra de ejemplo, `supabase/seed.sql`.
3. Darse acceso como administrativo (cambiar el correo):
   ```sql
   insert into invitaciones(email, rol, nombre) values ('correo@dominio.com', 'admin', 'Nombre');
   ```
4. Authentication > URL Configuration:
   - Site URL: `https://obras.teicod.com`
   - Redirect URLs: `https://obras.teicod.com/**` y `https://*.montego-portal.pages.dev/**`
5. Project Settings > API: copiar **Project URL** y **anon public key** en `assets/config.js`.

El correo incluido en Supabase envía pocos mensajes por hora; para clientes reales conviene configurar un SMTP propio (Authentication > Emails > SMTP Settings).

### 2. Cloudflare Pages
1. Workers & Pages > Create > Pages > Connect to Git > elegir `montego-portal`.
2. Framework preset: None. Build command: vacío. Build output directory: `/`.
3. Al terminar el primer despliegue: Custom domains > `obras.teicod.com` (el DNS se crea solo porque teicod.com ya está en Cloudflare).

Cada cambio que se sube a `main` se publica solo. Una rama distinta genera un enlace de prueba `*.montego-portal.pages.dev`.

## Cargar una obra desde el APU
En Gestión > "Cargar una obra desde el APU" se sube un JSON con: `codigo`, `nombre`, `cliente {codigo, razon_social}`, `ubicacion`, `fecha_inicio`, `plazo_dias`, `estado`, `iva_pct`, `contingencia_pct`, `responsable` y `lineas [{item, wbs, cod_cliente, cod_covenin, partida_id, descripcion, unidad, cantidad, pu, ejecutado?}]`. Los precios quedan congelados como línea base.
