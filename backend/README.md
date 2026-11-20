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

The shared demo snapshot and uploaded invoice PDFs are stored under `./data` relative to the backend working directory by default. On Render, mount a persistent disk at `/app/data` and set `EPS_DATA_DIR=/app/data`; both workflow state and invoice files then survive service restarts and deploys. Keep this demo service to one instance because its JSON snapshot and local invoice files are not a multi-instance database/object store. Without the mounted disk, Render's local filesystem is temporary and uploads/state may be lost when the instance is replaced.

Supplier invoices use `POST /api/demo-state/invoices/{poId}` with multipart fields `supplierId`, `invoiceNumber`, `invoiceAmount`, `invoiceDate`, and `file` (PDF, maximum 10 MB). The response is the updated shared snapshot. `GET /api/demo-state/invoices/{fileId}` serves a stored PDF for supplier and finance review. `EPS_DEMO_STATE_FILE` and `EPS_INVOICE_DIR` can override the default paths separately. Configure `EPS_CORS_ALLOWED_ORIGINS` with the frontend origin when hosted.

The API and authentication are intended for demo use with sample data, not production records.
