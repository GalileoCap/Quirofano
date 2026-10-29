---
name: migracion
description: Cambiar la forma de lo guardado en el navegador (localStorage, quiro-v1, quiro-sources-v1, respaldo de Datos): versión, paso de migración, lectores y su test. Usar antes de tocar src/persist.ts, la forma de useStore o useSources, o FIELDS.
---

# Lo guardado en el navegador y sus migraciones

Todo vive en `localStorage` con zustand persist, en dos claves (`src/store.ts`): `quiro-v1` (lo escrito a mano, las tareas y las novedades de la última carga; `useStore`) y `quiro-sources-v1` (agenda y eventos del calendar; `useSources`). La versión va dentro de lo guardado (`{"state":…,"version":N}`) y las claves no se renombran nunca: `v1` en el nombre es histórico, no la versión.

Todo lo que tenga que ver con la forma de lo guardado está en `src/persist.ts`. Para cambiarla:

**Una migración por deploy, no una por cambio.** Entre un deploy y el siguiente, todos los cambios a la forma de lo guardado se juntan en un solo paso (una sola subida de versión). Mientras el cambio no se deployó, ese paso se sigue editando en vez de sumar otro, y la versión no vuelve a subir. Lo deployado manda: no se toca un paso que ya salió, se agrega uno nuevo. Hoy no hay nada deployado, así que `USER_VERSION` (1) y `SOURCES_VERSION` (1) son la base de la primera salida.

1. Subir `USER_VERSION` (o `SOURCES_VERSION`), solo si desde el último deploy no se había subido ya.
2. Agregar en `USER_MIGRATIONS` (o `SOURCES_MIGRATIONS`) el paso que lleva de la versión anterior a la nueva; la clave es la versión de la que parte. `runMigrations` los encadena en orden y lanza si falta uno.
3. Si cambia la forma de un campo, ajustar su lector (`readUserData`, `readSources`, `readNews`). Esos lectores corren siempre después de la migración y también con lo que está en la versión actual: lo que falta queda vacío (así una columna nueva en `FIELDS` no rompe filas viejas) y lo que no se entiende se descarta entrada por entrada, sin tumbar la app.
4. Escribir el test del paso con un estado de la versión vieja (`tests/persist.test.ts`).

El respaldo de Datos (`writeBackup`/`readBackup`) lleva `version` y pasa por las mismas migraciones. Los respaldos anteriores no la traen y se leen como versión 1. Uno de una versión más nueva que la de la app se rechaza con un aviso en vez de leerse a medias.

Antes de leer lo guardado con otra versión (más vieja, más nueva o ilegible), `quiro-v1` se copia tal cual a `quiro-v1.antes-vN` (si esa copia ya existe no se pisa), para que una migración que sale mal o una pestaña con la app vieja no destruya lo escrito. La agenda y los calendarios no se copian: se vuelven a cargar. Las copias no se borran solas.
