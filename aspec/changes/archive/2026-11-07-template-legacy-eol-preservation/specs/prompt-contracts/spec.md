# Delta: prompt-contracts

## ADDED Requirements

### Requirement: Preservación del fin de línea por línea al reconciliar bloques legacy

`reconcileLegacyBlocks` SHALL preservar el fin de línea (EOL) original de cada línea superviviente
cuando elimina un run legacy: la división del contenido SHALL capturar el EOL de cada línea y el
re-join SHALL usar el EOL propio de cada línea conservada, en lugar del EOL dominante del archivo.
Las líneas eliminadas junto con el run legacy SHALL llevarse su propio EOL.

El estado de newline final de la salida SHALL ser igual al de la entrada: la salida SHALL terminar
en newline si y sólo si la entrada terminó en newline. Si la entrada no termina en newline, el
re-join SHALL eliminar todas las secuencias EOL finales del resultado (`"A\n\n<run>"` => `"A"`);
la misma entrada con newline final (`"A\n\n<run>\n"` => `"A\n\n"`) SHALL conservar esas secuencias.

La semántica de eliminación NO SHALL cambiar: qué líneas constituyen el run legacy, la coincidencia
exacta de firmas, la seguridad ante bloques personalizados y la idempotencia SHALL permanecer
idénticas.

Cuando no se elimina ningún run legacy (`removed === false`), la función SHALL devolver el contenido
de entrada byte a byte, sin normalizar EOL. Esta invariancia SHALL conservarse exactamente.

MEM-05g (`maskLockedLines` con fences dentro de bloques `LOCKED`) NO SHALL implementarse en este
change.

#### Scenario: Un archivo de EOL mixto conserva el EOL de cada línea superviviente al eliminar un run legacy

- **WHEN** `reconcileLegacyBlocks` elimina un run legacy de un archivo cuyo EOL es mixto
- **THEN** cada línea superviviente conserva el EOL que tenía en la entrada, y el estado de newline final de la salida es igual al de la entrada: termina en newline si y sólo si la entrada terminó en newline
- **AND** si la entrada no termina en newline, todas las secuencias EOL finales del resultado se eliminan (`"A\n\n<run>"` => `"A"`), mientras que con newline final se conservan (`"A\n\n<run>\n"` => `"A\n\n"`)
- **AND** el EOL dominante no se aplica sobre las líneas supervivientes

#### Scenario: Sin run legacy el contenido se devuelve byte a byte

- **WHEN** `reconcileLegacyBlocks` no elimina ningún run legacy
- **THEN** devuelve el contenido de entrada byte a byte
- **AND** no normaliza el EOL de ninguna línea

#### Scenario: Un archivo CRLF homogéneo sigue siendo CRLF

- **WHEN** `reconcileLegacyBlocks` elimina un run legacy de un archivo con EOL CRLF homogéneo
- **THEN** todas las líneas supervivientes conservan su EOL CRLF
- **AND** el archivo resultante no mezcla EOL

#### Scenario: Un archivo LF homogéneo sigue siendo LF

- **WHEN** `reconcileLegacyBlocks` elimina un run legacy de un archivo con EOL LF homogéneo
- **THEN** todas las líneas supervivientes conservan su EOL LF
- **AND** el archivo resultante no mezcla EOL

#### Scenario: La eliminación no agrega ni quita la línea final

- **WHEN** `reconcileLegacyBlocks` elimina un run legacy de un archivo que termina en newline y de uno que no termina en newline
- **THEN** la salida termina en newline si y sólo si la entrada terminó en newline
- **AND** si la entrada no termina en newline, se eliminan todas las secuencias EOL finales del resultado, incluida la línea en blanco previa al run eliminado (`"A\n\n<run>"` => `"A"`), mientras que la misma entrada con newline final las conserva (`"A\n\n<run>\n"` => `"A\n\n"`)
- **AND** no se agrega una línea en blanco al final
