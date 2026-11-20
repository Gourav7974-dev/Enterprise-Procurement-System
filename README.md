# Enterprise Procurement System demo

The demo has a React/Vite frontend and a Spring Boot backend. The frontend saves workflow data in the browser and synchronizes it with the backend so refreshes and other browsers using the same backend can see the latest data.

## Run locally

Start the backend first:

```powershell
cd backend
mvn spring-boot:run
```

Then start the frontend in a second terminal:

```powershell
cd front-end
npm install
npm run dev
```

The Vite development build connects to `http://localhost:8080/api` by default. Set `VITE_API_BASE_URL` in the frontend environment when the backend is hosted elsewhere. For a live demo, point it at the deployed Spring Boot API and set `EPS_CORS_ALLOWED_ORIGINS` on the backend to the frontend origin.

The backend writes the shared demo snapshot to `backend/data/eps-demo-state.json`. Set `EPS_DEMO_STATE_FILE` to a persistent disk path on the hosting service so data survives backend restarts and redeploys.

## Demo accounts

Use each account's email and the part before `@` followed by `123` as its password. For example, `ravi@company.com` uses `ravi123`, and `amit@technohub.in` uses `amit123`.

These are demo credentials and demo data. Do not enter real company information or use this mock authentication for production.
