# EcoleDirecte

Esta integración conecta Gladys con **EcoleDirecte**, la plataforma escolar en
línea de muchos centros de secundaria franceses. Para cada hijo que sigue la
cuenta, lee las notas y medias, los deberes, el horario, las ausencias y
retrasos, y el buzón de mensajes.

Funciona a través de internet (distintivo **cloud**): no hay nada que instalar
en su red. Requiere **Gladys 5.3.0 o superior**.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **usuario** y la **contraseña** que escribe en
   [ecoledirecte.com](https://www.ecoledirecte.com). Una cuenta de **padres** da
   todos los hijos; una cuenta de **alumno** da el propio alumno.
3. Ajustes opcionales:
   - **Intervalo de actualización**: cada 30 minutos por defecto (10 minutos como
     mínimo);
   - **Zona horaria del centro**: `Europe/Paris` por defecto. Cámbiela solo para
     un centro fuera de la Francia metropolitana (`America/Martinique`,
     `Indian/Reunion`…);
   - **Idioma de los nombres de dispositivos**: el idioma de los nombres escritos
     al crear los dispositivos.
4. Guarde y pulse **Probar la conexión**.

### La pregunta de seguridad

La primera vez, EcoleDirecte suele pedir que se confirme el dispositivo con una
pregunta (por ejemplo «¿Cuál es su año de nacimiento?»). El estado de la
integración lo indica. En ese caso:

1. pulse **Obtener la pregunta de seguridad**: la pregunta y las respuestas
   posibles, numeradas, aparecen bajo el botón;
2. en menos de 10 minutos, escriba el **número** de la respuesta correcta (o su
   texto) en **Responder a la pregunta de seguridad**.

La integración guarda la respuesta: la pregunta no se vuelve a hacer en los
siguientes arranques. Si EcoleDirecte la vuelve a hacer algún día, repita estos
dos pasos.

## Dispositivos

Cada hijo aparece en la pestaña **Descubrimiento**; añádalo. Sus funciones:

| Función              | Contenido                                            |
| -------------------- | ---------------------------------------------------- |
| Media general        | Media del periodo en curso (sobre 20)                |
| Última nota (/20)    | Última nota introducida, sobre 20                    |
| Última nota          | En texto: «MATHEMATIQUES : 15/20 (Contrôle chap. 3)» |
| Deberes para mañana  | Deberes no hechos para mañana                        |
| Deberes pendientes   | Deberes no hechos que quedan por venir               |
| Próxima clase        | «08:00 MATHEMATIQUES (S12)», con el día si no es hoy |
| Ausencias / Retrasos | Número en el curso escolar                           |
| Mensajes no leídos   | Mensajes no leídos del buzón de la cuenta            |

Cuando el centro desactiva un módulo (por ejemplo las notas), la función
correspondiente queda vacía. Si el centro no publica la media general, la
integración la calcula a partir de las notas: media de cada asignatura (con los
coeficientes) y luego media de las asignaturas.

## Escenas (Gladys 5.1 o superior)

### Disparadores

- **Nueva nota**: variables `subject`, `assignment`, `grade`, `out_of`,
  `grade_20`, `date`, `student_name`.
- **Nuevos deberes**: `subject`, `due_date`, `is_test`.
- **Nueva ausencia o retraso**: filtro por tipo; `kind`, `date`, `label`,
  `justified`.
- **Clase anulada**: una próxima clase ha sido anulada; `subject`, `date`,
  `start`, `end`, `teacher`.
- **Nuevo mensaje**: `from`, `subject`, `date`.

Cada uno puede filtrarse por alumno. En el primer arranque, la integración
registra lo que ya existe sin disparar nada.

### Acciones

- **Actualizar EcoleDirecte**: lee EcoleDirecte de inmediato.
- **Obtener los deberes** (hoy, mañana, próximo día de clase): `count`, `tests`,
  `subjects`, `summary` (el contenido de los deberes, listo para enviar).
- **Obtener el horario**: `has_lessons`, `first_start`, `first_subject`,
  `last_end`, `lesson_count`, `cancelled_count` — lo necesario para poner el
  despertador a la primera clase.

Ejemplo: cada tarde a las 19 h, «Obtener los deberes» para mañana y enviar
`summary` por Telegram si `count` es mayor que 0.

## Widgets (Gladys 5.1 o superior)

- **Resumen escolar**: media, última nota, deberes para mañana y mensajes no
  leídos en directo, próxima clase, ausencias y retrasos.
- **Deberes**: los deberes pendientes, con su contenido.
- **Horario**: las clases de un día, con las anuladas señaladas.

Elija el alumno en los ajustes del widget.

## Solución de problemas

- «EcoleDirecte ha rechazado el usuario o la contraseña»: compruébelos en
  ecoledirecte.com.
- «El centro no está disponible»: EcoleDirecte suele cerrar el acceso durante las
  vacaciones; la integración lo reintenta sola.
- «EcoleDirecte ha rechazado la versión de la API»: actualice la integración.
- Los registros de la integración nunca muestran la contraseña.
