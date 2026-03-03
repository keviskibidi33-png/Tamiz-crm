# Branding Iframes - Tamiz

Documento de referencia para mantener consistente el branding del microfrontend de **Tamiz** y su visualizacion embebida en iframe dentro del CRM.

## Alcance

- Microfrontend: `tamiz-crm`
- Shell embebedor: `crm-geofal` modulo Tamiz
- Flujo: CRM abre `https://tamiz.geofal.com.pe` en dialog modal con `token` y opcionalmente `ensayo_id`

## Reglas visuales

- Mantener estructura de hoja tecnica fiel a `Template_Tamiz.xlsx`.
- Preservar bloque ASTM C117-23.
- Mantener consistencia visual con modulos recientes de laboratorio.
- Botonera final con acciones `Guardar` y `Guardar y Descargar`.

## Contrato iframe

- Entrada por query params: `token`, `ensayo_id`.
- Mensajes hijo -> padre: `TOKEN_REFRESH_REQUEST`, `CLOSE_MODAL`.
- Mensaje padre -> hijo: `TOKEN_REFRESH`.
