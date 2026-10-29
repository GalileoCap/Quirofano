---
id: A3
from: [O2]
source: session
status: decided 2026-10-29
kind: behaviour
implemented_by: [src/ics.ts, src/agenda.ts, src/problems.ts, src/components/ChecklistView.tsx]
proven_by: [tests/checklist.test.ts, tests/problems.test.ts]
supersedes: []
---

# A3 Lo que no se lee se avisa en dos niveles

Todo evento de un calendario de cirugías que no se lee como cirugía es un `CalProblem`. Es `strong` (aviso arriba) si tiene una palabra quirúrgica, una HC, un teléfono o un ojo, o si es del calendario de suspensiones. Si no, va a la lista desplegable "N eventos del calendar no se leyeron como cirugía esta semana". Las dos formas tienen "Cargar a mano" y "Reconocer". Una fila de la agenda con la fecha rota, cargada en los últimos 120 días, se avisa arriba. Una fila con algún dato pero sin nombre ni HC entra al checklist.

## Contexto

Una lista de palabras dejaba afuera cirugías reales: seis desde julio, entre ellas «Melina Cecilia Chala, granu», que no tiene ninguna señal. El dueño eligió los dos niveles el 2026-10-29.

## Opciones

- Todo como aviso fuerte: más simple, pero son unos cinco por semana (vacaciones día por día, feriados) que tapan lo importante.
- Dos niveles, el elegido: nada queda oculto, y lo que parece cirugía resalta.

## Consecuencias

Los eventos personales del calendario AGENDA aparecen en la lista hasta que se reconocen, uno por día. Un recordatorio con una palabra quirúrgica («NO CIRUGIAS CATARATAS PRE REBECOS») avisa fuerte. Siguen afuera, sin aviso, los cancelados, los calendarios que no son de cirugías (feriados, cumpleaños) y las filas de la agenda con la fecha rota de hace más de 120 días. Se deshace si la lista resulta tan larga que la dejan de mirar.
