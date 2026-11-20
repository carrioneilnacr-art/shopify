# Backend del planificador — Perú Explora IA

API serverless que conecta el formulario Shopify con OpenAI Responses API.

## Variables de entorno (Vercel)
- OPENAI_API_KEY: clave secreta nueva. No debe aparecer en Git, Liquid ni JavaScript del navegador.
- OPENAI_MODEL: opcional; por defecto gpt-5.4-mini.
- ALLOWED_ORIGINS: opcional; lista de orígenes Shopify permitidos separados por comas. Por defecto permite la tienda preliminar.

## Endpoint
POST /api/plan-trip

Body JSON: origin, days, budget, travellers, style, month, interests.

## Seguridad y privacidad
- La clave se lee únicamente desde el entorno del servidor.
- Se usa Responses API con store:false.
- Valida longitudes y rangos, aplica un límite básico por IP y restringe CORS.
- El límite en memoria es protección inicial, no un rate limiter distribuido. Antes de una campaña pública, añade Turnstile y un límite persistente.
- No registra el texto del viaje ni la clave en logs.

Los costes y datos logísticos son orientativos; el usuario debe confirmar los detalles con fuentes oficiales y operadores.
