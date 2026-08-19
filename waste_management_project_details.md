# WasteWise AI - Project Details & Fact Sheet
*(Use this document as the core material to feed into any AI to generate your presentation)*

## 1. Project Overview
- **Name:** WasteWise AI
- **Tagline:** Next-Generation Intelligent Municipal Waste Management
- **Core Concept:** A unified software ecosystem that bridges the gap between citizens reporting street-level waste and municipal authorities dispatching trucks to clean it. It replaces outdated, manual dispatch systems with an automated, AI-driven intelligence layer.

## 2. The Problem We Are Solving
- **Inefficiency:** Current municipal waste collection relies on rigid, static routes or delayed manual reporting.
- **High Costs:** Trucks burn excess fuel driving to empty bins or taking inefficient routes, leading to high fuel and overtime wage costs.
- **Orphaned Waste:** Unreported or mismanaged waste accumulates, leading to health hazards and environmental degradation.
- **Fraud/Bad Data:** Citizens often upload old photos or fake reports, wasting municipal time and resources verifying them.

## 3. The Solution (Key Features)

### A. The Citizen Service Portal
- **Frictionless Reporting:** A simple, mobile-friendly interface for citizens to report waste.
- **WebRTC Live-Camera Enforcement:** Prevents users from uploading old or fraudulent photos from their camera roll. Citizens *must* tap the screen to open their live camera and take a picture of the waste in real-time.
- **Live GPS Tagging:** Automatically extracts exact geolocation (latitude/longitude) so trucks know exactly where to go.

### B. AI Computer Vision (CV) Engine
- **Instant Triage:** Before a human even sees the report, the AI analyzes the citizen's live photo.
- **Categorization:** Detects the type of waste (e.g., Plastic Packaging, Organic, Mixed Solid Waste).
- **Volume & Severity:** Estimates the physical volume (m³) and assigns a priority/severity score (from 0 to 10).

### C. Officer / Admin Command Center
- **Map-Based Triage:** A sleek spatial dashboard built with MapLibre GL JS showing a live map of all active waste hotspots.
- **Clustering:** Groups multiple citizen reports of the same incident together to prevent duplicate truck dispatches.
- **Manual Overrides:** While AI suggests actions, the human officer has ultimate control. They can view the photos, read the AI analysis, manually override the severity (e.g., escalate to P0 Emergency), and manually assign specific trucks.

### D. Smart Fleet Management
- **Complete Oversight:** Officers can manage the entire fleet of municipal trucks and drivers (Add, Edit, Remove, assign drivers to zones).
- **Logical Safeguards:** Built-in business logic prevents a loaded truck (payload > 0 kg) from being put into "Maintenance" mode, ensuring waste is never orphaned on the street. 

### E. AI Dynamic Routing (The Brains)
- **TSP Optimization:** Solves the Traveling Salesperson Problem using OSRM (Open Source Routing Machine) logic. 
- **Dynamic Waypoints:** Instead of static routes, trucks are dynamically routed to the most critical, high-severity hotspots first, minimizing travel distance and fuel consumption.

### F. Financial Analytics Dashboard
- **Proving ROI:** A dedicated dashboard for stakeholders showing exactly how much money the platform is saving.
- **Metrics Tracked:** Total Operations Cost (Month-to-Date), Fuel Expenses, Maintenance & Repair costs, and the ultimate metric: **Cost Per Ton of Waste**.
- **AI Savings:** Quantifies exactly how much money was saved in fuel and overtime wages by using the dynamic AI routing vs. traditional baseline routes.

## 4. Technology Stack
- **Frontend (Web):** Next.js (React App Router), Tailwind CSS (for modern, glassmorphic UI), Lucide React (icons), MapLibre GL JS (spatial mapping), WebRTC API (camera).
- **Backend (API):** Python FastAPI, SQLAlchemy (ORM), Alembic (Database Migrations).
- **Database:** PostgreSQL (with PostGIS extension for complex spatial/location querying).
- **AI/ML Layer:** Custom Computer Vision pipeline, Multi-Agent LLM System (Municipal Agent / Verification Agent), and OSRM for dynamic routing.

## 5. Value Proposition & Impact
- **Economic:** Drastically reduces fuel consumption and vehicle wear-and-tear.
- **Environmental:** Lowers municipal carbon footprint and keeps streets visibly cleaner, faster.
- **Operational:** Empowers officers with data-driven decision-making instead of guesswork.
