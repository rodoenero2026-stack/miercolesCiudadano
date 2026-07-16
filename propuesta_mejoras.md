# Propuesta de Mejoras: Proyecto Miércoles Ciudadano (San Fernando, Chiapas)

Tras analizar en detalle el código del backend ([server.js](file:///C:/miercolesCiudadano/server.js)) e interfaces ([index.html](file:///C:/miercolesCiudadano/index.html) y [admin.html](file:///C:/miercolesCiudadano/admin.html)), he identificado varias áreas de oportunidad clave para robustecer el sistema, mejorar la seguridad y ofrecer una mejor experiencia tanto a los ciudadanos como a los administradores municipales.

A continuación se detallan las propuestas de mejora categorizadas por áreas críticas.

---

## 1. 🛡️ Seguridad y Autenticación

Aunque el sistema cuenta con control de acceso mediante tokens JWT en endpoints críticos de [server.js](file:///C:/miercolesCiudadano/server.js#L320-L550), presenta algunas vulnerabilidades importantes de seguridad:

### Contraseñas en Texto Plano e Inconsistencia de bcryptjs
* **Situación actual:** En `package.json`, la dependencia `bcryptjs` está instalada, pero **no se utiliza en ningún lugar**. La contraseña del administrador se compara directamente en texto plano en [server.js:L113](file:///C:/miercolesCiudadano/server.js#L113) (`password === ADMIN_PASSWORD`).
* **Propuesta:** Crear una tabla `administradores` en la base de datos (mediante [database.js](file:///C:/miercolesCiudadano/database.js)) que almacene los usuarios administradores y sus contraseñas encriptadas mediante hash (`bcryptjs.hash()`). Esto permitirá también contar con múltiples cuentas administrativas en lugar de una única credencial global compartida.

### Ausencia de Rate Limiting (Límite de Peticiones)
* **Situación actual:** Los endpoints públicos como `/api/registro` y `/api/agendar-cita` no tienen límites de tasa de peticiones.
* **Propuesta:** Implementar `express-rate-limit` para prevenir ataques de denegación de servicio (DoS) o bots que llenen los 15 espacios disponibles de los miércoles de forma malintencionada y saturen el servidor de correo electrónico con confirmaciones.

### Llave Secreta JWT por Defecto (Fallback inseguro)
* **Situación actual:** Si la variable `JWT_SECRET` no se carga adecuadamente desde el archivo `.env`, el código utiliza `'secret_key_miercoles_ciudadano'` por defecto.
* **Propuesta:** Lanzar un error crítico al arrancar la aplicación si no se encuentra configurado `JWT_SECRET` en producción, evitando fallbacks que puedan comprometer la seguridad de los tokens firmados.

---

## 2. ⚙️ Funcionalidades del Negocio y Configuración Dinámica

Actualmente, las reglas de negocio están codificadas de forma rígida (hardcoded) en el código.

### Configuración Dinámica del Límite de Citas
* **Situación actual:** El límite máximo de 15 citas por día miércoles está hardcodeado en el backend ([server.js:L243](file:///C:/miercolesCiudadano/server.js#L243)).
* **Propuesta:** Crear una tabla `configuraciones` en la base de datos para almacenar variables como:
  * Límite de citas por miércoles (ej. 15, 20 o 10).
  * Horarios de atención disponibles (intervalos).
  * Correos destinatarios de notificaciones de administración.
  Esto permitirá que el administrador edite estos valores desde el panel en [admin.html](file:///C:/miercolesCiudadano/admin.html) sin necesidad de modificar el código del servidor.

### Bloqueo de Fechas Específicas (Feriados o Eventos Especiales)
* **Situación actual:** El sistema asume que todos los miércoles están disponibles, siempre y cuando no se superen las 15 citas de límite. Sin embargo, hay miércoles inhábiles (Navidad, Año Nuevo, días festivos) o fechas en las que el Presidente Municipal tendrá otros compromisos públicos.
* **Propuesta:** Crear una tabla `fechas_bloqueadas` administrada desde el panel. Al seleccionar una fecha bloqueada, el frontend ([index.html](file:///C:/miercolesCiudadano/index.html)) la mostrará como no disponible y el backend rechazará citas en ese día.

### Consulta de Estado Pública para el Ciudadano
* **Situación actual:** Cuando un ciudadano se registra y agenda su cita, recibe correos informativos. Si desea conocer el estado de su cita, debe revisar su correo electrónico.
* **Propuesta:** Agregar un buscador público sencillo en la página de inicio ([index.html](file:///C:/miercolesCiudadano/index.html)) donde el ciudadano ingrese su folio (ej. `SF-02`) y su correo/teléfono para consultar en tiempo real el estado de su cita ("pendiente", "confirmada", "cancelada") junto a las observaciones dejadas por el administrador.

---

## 3. 📧 Sistema de Notificaciones

Las notificaciones son fundamentales para que el ciudadano acuda puntualmente.

### Reenvío Manual de Correo Electrónico
* **Situación actual:** Si un correo de confirmación no llega al ciudadano (por caída temporal de la red, SMTP inactivo temporalmente o bandeja de SPAM), no hay forma de volver a enviarlo de manera oficial.
* **Propuesta:** Crear un endpoint por el backend (`POST /api/citas/:id/reenviar-correo`) y un botón de "Reenviar Correo" en el panel administrativo de [admin.html](file:///C:/miercolesCiudadano/admin.html).

### Integración con SMS o WhatsApp
* **Situación actual:** La comunicación es 100% por correo electrónico. Sin embargo, en municipios de Chiapas, muchos ciudadanos no tienen o no revisan con frecuencia su bandeja de correo electrónico, pero sí cuentan con teléfonos celulares.
* **Propuesta:** Evaluar la integración de servicios como Twilio (SMS/WhatsApp) para mandar confirmaciones y recordatorios directo al teléfono celular registrado del ciudadano.

---

## 4. 🏗️ Arquitectura y Calidad del Código

El código actual es compacto, lo cual facilita su legibilidad inicial, pero para escalarlo y mantenerlo limpio a mediano plazo, se sugieren los siguientes cambios estructurales:

### Modularización del Backend
* **Situación actual:** [server.js](file:///C:/miercolesCiudadano/server.js) contiene la configuración del servidor, middlewares, toda la lógica de los controladores, las tareas cron y el ruteo general.
* **Propuesta:** Reorganizar la estructura de archivos en directorios separados:
  * `/routes`: Definición de los endpoints.
  * `/controllers`: Lógica de procesamiento de las solicitudes.
  * `/middlewares`: Autenticación, validaciones de esquemas, etc.
  * `/jobs`: El proceso cron diario para recordatorios.

### Validación Formal de Datos (Schemas)
* **Situación actual:** Las validaciones de datos en [server.js](file:///C:/miercolesCiudadano/server.js) se hacen manualmente con condiciones condicionales `if`.
* **Propuesta:** Implementar librerías de validación como `joi` o `express-validator` para asegurar que las entradas cumplan rigurosamente con los formatos esperados antes de interactuar con la base de datos.

### Migraciones de Base de Datos
* **Situación actual:** La base de datos SQLite se inicializa creando tablas únicamente con la cláusula `CREATE TABLE IF NOT EXISTS` en [database.js](file:///C:/miercolesCiudadano/database.js).
* **Propuesta:** Si agregamos nuevas tablas (`administradores`, `fechas_bloqueadas`, `configuraciones`), será ideal contar con un script de migración que actualice las tablas de forma limpia en el servidor local y de producción sin alterar la base de datos existente.

---

## 📋 Resumen de Acciones Recomendadas

| Prioridad | Tarea | Beneficio |
| :--- | :--- | :--- |
| **Alta** | Hashear la contraseña del administrador con `bcryptjs` en base de datos. | Evita el uso de contraseñas inseguras en texto plano y fallbacks débiles. |
| **Alta** | Implementar bloqueo de fechas inhábiles (miércoles festivos o agendas llenas). | Evita citas inválidas en días feriados que confundan a la ciudadanía. |
| **Media** | Agregar botón para reenviar correos electrónicos en el panel. | Resuelve problemas cotidianos cuando el ciudadano no recibe el comprobante. |
| **Media** | Desarrollar el buscador de citas público en la página de inicio. | Reduce llamadas y visitas al ayuntamiento para consultar "si la cita fue aprobada". |
| **Baja** | Modularizar el backend en carpetas (`routes`, `controllers`, `middlewares`). | Mejora sustancialmente el mantenimiento del software. |
