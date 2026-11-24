# SDLC Rx frontend

This is a lightweight React/Vite demonstration frontend for the existing SDLC Rx Mastra project. It keeps the requirements and SDLC agents unchanged and calls the registered `requirements-then-sdlc` workflow over Mastra's HTTP API.

## Run it with the existing Mastra project

1. Start the existing SDLC Rx Mastra app in one terminal:

   ```bash
   cd SDLC-Rx
   npm install
   npm run dev
   ```

   Keep the Mastra development server on its normal port. The workflow is exposed at `/api/workflows/requirements-then-sdlc/start-async`.

2. Start this frontend in a second terminal. If the frontend runs on a different port than Mastra, set the Mastra origin before starting Vite:

   ```bash
   cd sdlcrx
   npm install
   VITE_MASTRA_API_BASE_URL=http://localhost:4111/api npm run dev
   ```

   Replace `4111` with the port shown by the Mastra CLI if it is different. If you serve the frontend from the same origin as Mastra, omit the variable and the app will use `/api`.

3. Open the Vite URL shown in the terminal. Enter a healthcare software brief and choose **Generate plan**. The current backend intentionally waits about 65 seconds between its two model calls, so the UI keeps a visible long-running state until the workflow returns.

## Integration notes

The request sent by the frontend is:

```json
{
  "inputData": {
    "prompt": "Your natural-language healthcare software brief"
  }
}
```

The frontend expects the successful Mastra response to contain `result.requirements` and `result.sdlc`. The URL is controlled by `VITE_MASTRA_API_BASE_URL`; no API keys are placed in browser code.

For the first demonstration, the India/US corpus selection remains backend-controlled and is intentionally not exposed in this UI. The interface also has no authentication, saved projects, editing, or multi-user state.

## Validate the frontend

```bash
npm run typecheck
npm run build
```
