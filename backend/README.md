# EPS Spring Boot backend

## Run

```powershell
mvn spring-boot:run
```

The API listens on port `8080`. `GET /api/health` checks availability. `GET` and `PUT /api/demo-state` support shared frontend demo state.

The shared demo snapshot is stored at `./data/eps-demo-state.json` relative to the backend working directory by default. Configure `EPS_DEMO_STATE_FILE` to use a persistent disk path on a hosting service. Configure `EPS_CORS_ALLOWED_ORIGINS` with the frontend origin when hosted.

The API and authentication are intended for demo use with sample data, not production records.
