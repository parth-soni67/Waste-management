# Prompt for ChatGPT: System Architecture Generation

**Role:** You are a Staff Software Engineer and Principal Architect at a top-tier tech company (like Meta). You are tasked with designing and explaining the system architecture for "WasteWise AI", a modern, AI-powered municipal waste management platform.

**Task:** Generate a comprehensive System Architecture Document (SAD) for WasteWise AI. The document must be professional, highly technical, and include sections on High-Level Architecture, Component Diagram descriptions (so I can draw them in Draw.io), Data Flow, Technology Stack, AI Integration, and Deployment Strategy.

**System Context (WasteWise AI):**
- **Overview:** An AI-driven municipal waste reporting and fleet routing system.
- **Frontend (Web):** Next.js (React), Tailwind CSS, MapLibre GL for spatial mapping. Serves 3 portals:
  1. **Citizen Portal:** For reporting waste using enforced live-camera capture (WebRTC) and live GPS tagging.
  2. **Officer/Admin Portal:** For Incident Triage, Map-based tracking, and Manual Overrides (severity, truck assignment). Features a fleet management module (Trucks & Drivers).
  3. **Analytics Dashboard:** For Financial Cost Reporting (ROI of AI routing, fuel expenses) and Environmental KPIs.
- **Backend (API):** Python FastAPI, SQLAlchemy (ORM), Alembic for migrations.
- **Database:** PostgreSQL (with PostGIS extension for spatial querying of incidents).
- **AI/ML Components:**
  1. **CV Engine:** Analyzes citizen photos to detect waste category, volume (m³), and calculate a severity score (0-10).
  2. **Multi-Agent System:** Autonomous AI agents (Municipal Agent, Verification Agent) that evaluate clustered reports and recommend dispatch actions.
  3. **Routing Engine:** OSRM-based Traveling Salesperson Problem (TSP) optimization to dynamically route trucks to active hotspots.
- **Key Workflows:**
  - Citizen submits a live photo -> CV Engine scores severity -> Backend clusters with nearby incidents -> Officer reviews/approves in command center -> Truck dispatched via AI routing.
  - Fleet management prevents trucks with active payloads from going into maintenance to avoid orphaned waste.

**Formatting Requirements:**
Use Markdown, clean headers, and professional architectural terminology. Provide a clear data flow sequence.
