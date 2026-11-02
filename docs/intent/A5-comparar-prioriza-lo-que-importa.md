---
id: A5
from: [O1, O2]
source: owner
status: decided 2026-11-02
kind: behaviour
implemented_by: [src/compare.ts, src/components/CompareDialog.tsx]
proven_by: [tests/compare.test.ts]
supersedes: []
---

# A5 Comparar deja plegadas las diferencias menores y busca lo que falta entre lo que no se leyó

El dueño pidió que las diferencias menores pesen mucho menos y que cada "Falta en la app" se busque entre lo que no se pudo cargar solo.

Un campo distinto es menor cuando no dice que la app armó mal la cirugía (`minorOf` en `src/compare.ts`). Hay cuatro casos: la columna solo se escribe a mano y la app la tiene vacía, el valor es el mismo escrito de otra forma (`+22.00` y `22`, un teléfono con otros separadores), uno dice lo mismo que el otro y algo más (`CATARATA` y `CATARATA BLANCA`), o el checklist lo deja vacío. La HC nunca cuenta como "dice más". Las menores van en una sección plegada al final y "Tildar todo" no las tilda.

Una cirugía que falta en la app se busca entre los eventos del calendar de la semana que no se leyeron (por su HC o por todas las palabras de un nombre de dos o más) y entre las filas de la agenda con la fecha rota. Primero se busca el mismo día. Si aparece, se muestra el evento, y aplicar la agrega a mano y reconoce ese aviso.

## Contexto

Con el checklist del 2/11, 108 de 157 diferencias eran columnas a mano, formato o detalle de más, y tapaban las que sirven para controlar la app (`O1`). De los 7 faltantes, 2 eran eventos que no se habían leído y ya se avisaban arriba (`O2`).

## Consecuencias

Una diferencia mal clasificada como menor queda escondida, por eso el test fija cada caso. Reconocer al aplicar saca el aviso de arriba. Vuelve a avisar si el evento cambia.
