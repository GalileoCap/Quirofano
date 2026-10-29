---
id: A4
from: [O3]
source: owner
status: decided 2026-10-29
kind: behaviour
implemented_by: [src/merge.ts, src/components/DetailDialog.tsx]
proven_by: [tests/checklist.test.ts]
supersedes: []
---

# A4 De una fila de la agenda de otra fecha se toma solo la persona

Cuando el calendar tiene una cirugía y la fila de la agenda de esa persona es de otra fecha (o la fecha está rota), se toman de ella nombre, HC, teléfono, contacto y DNI. Cirugía, cirujano, ayudante, ojo y dioptrías salen del calendar, y duración, anestesia y observaciones quedan vacías. La fila avisa por qué, y el detalle ofrece "Usar los datos de la agenda del …", que los escribe a mano (`SURGERY_FIELDS`).

## Contexto

Con los datos del 2026-10-29, 50 de 308 cruces usaban una fila de otra fecha y copiaban todo. Por ejemplo, un AAG OD tomaba una blefaroplastia de 2024, y una catarata tomaba el ojo y las dioptrías de otra de mayo. El dueño eligió esta opción.

## Opciones

- Copiar todo si la otra fecha está a menos de N días: sirve para las reprogramaciones, pero N sería un número inventado (regla 1).
- Copiar todo como hasta ahora, con una marca más visible: el dato equivocado seguiría puesto.

## Consecuencias

Las reprogramaciones que no se corrigieron en la agenda aparecen con "Falta: Duración" (y el ojo, si el calendar no lo trae) hasta que alguien toque el botón. Las filas con datos escritos a mano sobre esas cirugías pueden pasar a "Difiere", porque cambió lo que dicen las fuentes. Se deshace si casi todos los casos resultan ser reprogramaciones y el botón se vuelve un trámite.
