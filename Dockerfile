# ============================================================
# Multi-stage Dockerfile for MeetingsApp — Render.com ready
# ============================================================

# ---- Stage 1: Build with Maven ----
FROM eclipse-temurin:17-jdk AS build

WORKDIR /app

# Install Maven directly (more reliable than wrapper in Docker)
RUN apt-get update && apt-get install -y maven && rm -rf /var/lib/apt/lists/*

# Copy pom first for dependency caching
COPY pom.xml pom.xml

# Download dependencies (cached unless pom.xml changes)
RUN mvn dependency:resolve -B -q || true

# Copy source code
COPY src src

# Build the JAR (skip tests — they run in CI, not in Docker build)
RUN mvn clean package -DskipTests -B -q

# ---- Stage 2: Lightweight runtime ----
FROM eclipse-temurin:17-jre-alpine AS runtime

WORKDIR /app

# Create the H2 data directory (prevents 500 error on first run!)
RUN mkdir -p /opt/data && chmod 777 /opt/data

# Copy the built JAR from the build stage
COPY --from=build /app/target/MeetingsApp-0.0.1-SNAPSHOT.jar app.jar

# Expose default port (Render overrides via $PORT)
EXPOSE 10000

# Health check — ping login page
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-10000}/login || exit 1

# Run with render profile; Render sets $PORT automatically
ENTRYPOINT ["java", \
  "-Xmx512m", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
