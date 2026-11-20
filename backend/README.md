# EPS Spring Boot backend

## Run

```powershell
mvn spring-boot:run
```

The API listens on port `8080` by default. On Render, the application uses the `PORT` environment variable provided by the platform. `GET /api/health` checks availability. `GET` and `PUT /api/demo-state` support shared frontend demo state.

## Docker

From this `backend` directory, build and run the container:

```sh
docker build -t eps-backend .
docker run --rm -p 8080:8080 eps-backend
```

The image builds the executable JAR with Maven and Java 17, then runs it on a Java 17 runtime. For Render, create a Docker web service with this directory as the Docker build context (or set the Dockerfile path to `backend/Dockerfile` from the repository root). Attach a persistent disk at `/app/data` if demo state must survive container replacement or restart.

The shared demo snapshot is stored at `./data/eps-demo-state.json` relative to the backend working directory by default. Configure `EPS_DEMO_STATE_FILE` to use a persistent disk path on a hosting service. Configure `EPS_CORS_ALLOWED_ORIGINS` with the frontend origin when hosted.

The API and authentication are intended for demo use with sample data, not production records.
