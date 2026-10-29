---
id: A1
from: [O1]
source: owner
status: decided 2026-10-29
kind: behaviour
implemented_by: [src/compare.ts, src/components/CompareDialog.tsx]
proven_by: [tests/compare.test.ts]
supersedes: []
---

# A1 Comparar con un checklist cargado y ofrecer aplicar las diferencias

El botón "Comparar" del Checklist carga un CSV (la planilla de la residente o el que exporta la app), pasa a la semana que más cirugías tiene en él y lista, por día, las cirugías que faltan en la app, las que sobran y cada campo distinto. Cada diferencia tiene su casilla, y "Aplicar" hace solo lo tildado.

## Contexto

Lo pidió el dueño en esas palabras. En las preguntas del 2026-10-29 eligió que el checklist cargado se descarte al cerrar y que nada venga tildado.

## Opciones

- El checklist cargado se guarda como una fuente más: permitiría volver a compararlo, pero agrega una clave en `localStorage`, una migración y un tercer lugar con datos de pacientes. Lo descartó el dueño.
- Todo tildado, o los campos sí y las cirugías no: un clic iguala la app al archivo, pero con datos de pacientes es fácil pisar algo sin verlo. Lo descartó el dueño.

## Consecuencias

Comparar otra vez pide volver a cargar el archivo. Las columnas que la app no tiene (GOTAS, una sin nombre) no se comparan y se dice cuáles son. El orden dentro del día no se compara. La lectura por nombre de columna depende de la cabecera de la planilla: si la renombran, esa columna pasa a "no se compara". Se deshace si el control deja de hacer falta porque la residente arma el checklist solo desde la app.
