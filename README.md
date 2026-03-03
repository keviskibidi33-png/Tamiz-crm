# Tamiz CRM Frontend

Microfrontend del modulo **Tamiz ASTM C117-23** para Geofal.

- Dominio productivo: `https://tamiz.geofal.com.pe`
- Backend API: `https://api.geofal.com.pe` (rutas `/api/tamiz`)

## Objetivo

- Registrar y editar ensayos de lavado por tamiz No. 200.
- Mantener guardado incremental en BD (`EN PROCESO`/`COMPLETO`).
- Exportar Excel con plantilla oficial `Template_Tamiz.xlsx`.
- Cerrar modal del CRM luego de guardar.

## Stack

- Vite + React + TypeScript
- Tailwind CSS
- Axios
- React Hot Toast

## Variables de entorno

- `VITE_API_URL=https://api.geofal.com.pe`
- `VITE_CRM_LOGIN_URL=https://crm.geofal.com.pe/login`

## Desarrollo local

```bash
npm install
npm run dev
```
