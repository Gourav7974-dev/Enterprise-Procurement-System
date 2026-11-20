# Build the executable Spring Boot JAR with Java 17 and Maven.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

COPY pom.xml ./pom.xml
RUN mvn -B -ntp dependency:go-offline

COPY src ./src
RUN mvn -B -ntp package

# Run the JAR on a smaller Java 17 runtime image as a non-root user.
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

RUN groupadd --system spring \
    && useradd --system --gid spring --home-dir /app spring \
    && mkdir -p /app/data \
    && chown -R spring:spring /app

COPY --from=build --chown=spring:spring /workspace/target/eps-backend-1.0.0.jar /app/app.jar

USER spring:spring
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
