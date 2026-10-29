---
name: deploy
description: Deployar Quiro (versión, tag y push que publica en GitHub Pages). Solo cuando el dueño lo pide.
---

# Deploy y versiones

El repo es `git@github.com:GalileoCap/Quirofano.git` (remote `origin`, rama `main`). Solo se deploya cuando el dueño lo pide, y en cada deploy van juntos, en este orden:

1. Bumpear la versión de `package.json` (semver: `0.1.0` es la primera; la que está puesta ya es la del primer deploy, no se vuelve a subir) y, si cambió la forma de lo guardado desde el último deploy, la migración de ese deploy (skill `migracion`).
2. Commit, con `npm test`, `npm run build` y `session-tells` en verde.
3. Tag `vX.Y.Z` sobre ese commit.
4. Push de `main` y del tag.

El push del tag dispara `.github/workflows/deploy.yml`: corre `npm test` y `npm run build` y publica `dist/` en GitHub Pages, en `quirofano.smplworks.net` (el DNS está en Opalstack: un CNAME a `galileocap.github.io`; el dominio se configura en Settings → Pages del repo, no en un archivo `CNAME`). Los pushes a `main` sin tag no publican. Como `localStorage` es por origen, `quirofano.smplworks.net` no comparte nada con `guardias.smplworks.net` ni con `localhost`.

Entre deploys se commitea pero no se pushea. Como la app guarda todo en el navegador de cada persona, el "backup antes de deployar" es el JSON de Datos (Exportar JSON): se avisa que lo baje antes de abrir la versión nueva.
