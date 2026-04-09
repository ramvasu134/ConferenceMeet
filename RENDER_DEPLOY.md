# mtng - MeetingsApp | Render.com Deployment Guide

## Quick Deploy to Render.com

### Option 1: One-Click Blueprint (Recommended)
1. Push your code to a **GitHub** or **GitLab** repository
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click **"New"** → **"Blueprint"**
4. Connect your repository
5. Render reads `render.yaml` and auto-configures everything
6. Click **"Apply"** — done! 🚀

### Option 2: Manual Web Service Setup
1. Push your code to GitHub/GitLab
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click **"New"** → **"Web Service"**
4. Connect your repository
5. Configure:
   | Setting              | Value                              |
   |---------------------|------------------------------------|
   | **Name**            | `mtng-app`                        |
   | **Runtime**         | `Docker`                          |
   | **Dockerfile Path** | `./Dockerfile`                    |
   | **Plan**            | Free (or Starter for persistence) |
6. Add **Environment Variables**:
   | Key                        | Value    |
   |---------------------------|----------|
   | `SPRING_PROFILES_ACTIVE`  | `render` |
   | `JAVA_TOOL_OPTIONS`       | `-Xmx512m` |
7. Set **Health Check Path**: `/login`
8. Click **"Create Web Service"**

## What's Configured

### H2 Database Fix (The 500 Error Fix)
- **Problem**: Render containers have no `./data/` directory → H2 can't create DB → 500 error
- **Fix**: 
  - Dockerfile creates `/opt/data/` directory
  - `application-render.properties` uses absolute path: `/opt/data/meetingsdb`
  - `MeetingsAppApplication.main()` creates data dirs before Spring starts
  - H2 settings: `DB_CLOSE_ON_EXIT=FALSE;FILE_LOCK=NO` for container stability

### Port Configuration
- Render sets `$PORT` env var dynamically
- `application-render.properties`: `server.port=${PORT:10000}`
- No hardcoded port conflict

### Security (Production-Hardened)
- H2 Console **disabled** in render profile
- Thymeleaf cache **enabled**
- Connection pool tuned via HikariCP

## Important Notes

### Data Persistence
- **Free Plan**: Data is stored in `/opt/data/` inside the container. Data survives **restarts** but is lost on **redeploy** (new container image). The `DataInitializer` recreates default users automatically.
- **Paid Plan** (Starter $7/mo): Uncomment the `disk` section in `render.yaml` to mount a persistent disk at `/opt/data/`. Data survives across all deploys.

### Default Login Credentials
| Role    | Username | Password     |
|---------|----------|-------------|
| Teacher | `vk99`   | `123456`    |
| Student | `PEDDA`  | `student123`|
| Student | `55`     | `student123`|
| Student | `RAMESH` | `student123`|

### Local Development
Nothing changes for local dev — `application.properties` still uses:
- Port: `9090` 
- H2 file: `./data/meetingsdb`
- H2 Console: enabled at `/h2-console`

## Files Created/Modified for Render

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Docker build (JDK 17 build → JRE 17 runtime) |
| `.dockerignore` | Excludes IDE/target/data from Docker build context |
| `render.yaml` | Render Blueprint for one-click deployment |
| `system.properties` | Java version declaration for Render |
| `src/main/resources/application-render.properties` | Render-specific Spring profile |
| `src/main/java/.../DatabaseDirectoryInitializer.java` | Startup logging for DB status |
| `src/main/java/.../MeetingsAppApplication.java` | Creates data dirs before Spring loads |

## Troubleshooting

### "Application failed to start" on Render
- Check Render logs: Is PORT being set? Look for "Active Profile: render"
- Verify env var `SPRING_PROFILES_ACTIVE=render` is set

### 500 Error / Database Error
- Already fixed! The Dockerfile creates `/opt/data/` and the app creates dirs on startup
- If persists: Check Render logs for H2 connection errors

### Slow Cold Start (Free Plan)
- Render Free plan spins down after 15min of inactivity
- First request after sleep takes ~30-60 seconds (JVM startup + H2 init)
- Subsequent requests are fast

