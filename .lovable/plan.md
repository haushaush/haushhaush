

# Agency Dashboard – Haush Haush Digital / Viral Connect

## Overview
A full internal dashboard for a German performance marketing agency with dark navy/gold design, Supabase auth with role-based access, and comprehensive modules for CRM, projects, KPIs, finance, HR, and tasks.

## Design System
- **Colors**: Dark navy background (#0A1628), gold accent (#D4AF37), with lighter navy shades for cards/surfaces
- **Typography**: Playfair Display for headings, Inter for body text
- **Style**: Premium dark theme with gold highlights, clean data-dense layouts

## Authentication & Roles
- Supabase email/password login with branded login page
- Role-based access: Admin, Account-Manager, Setter
- `user_roles` table with RLS policies using `has_role()` security definer function
- Protected routes redirecting unauthenticated users to login

## Database (8 Supabase tables + auth)
1. **clients** – CRM with Kundenstatus, Ampelstatus, CLV tracking
2. **projects** – linked to clients, budget/saldo tracking
3. **tasks** – linked to projects, clients, and assignees with time tracking
4. **finance** – Einnahme/Ausgabe records with Zahlstatus
5. **team** – employee records with roles
6. **sales_performance** – setter metrics (calls, appointments, closes, revenue)
7. **ad_performance_intern** – client ad spend, leads, CPL
8. **vorquali_kpi** – setter qualification KPIs (Terminquote, No-Shows)
9. **user_roles** – role-based access control

## Sidebar Navigation & Pages

### 🏠 Dashboard
- Revenue overview cards (MRR, open invoices, active clients)
- Ampelstatus overview (Grün/Gelb/Rot/CC distribution)
- Recent activity feed
- Recharts: revenue trend, client status breakdown

### 👥 Kunden (CRM)
- Filterable/searchable client table with Ampelstatus color indicators
- Client detail view with linked projects, finance, and tasks
- Add/edit client forms with all fields including enums
- Kundenstatus and Ampelstatus quick-change actions

### 📁 Projekte
- Project list with status, budget, and linked client
- Project detail with tasks, ad performance, and budget tracking
- Create/edit project forms

### 📊 KPI
- Sales performance dashboard (per setter): calls, appointments, close rate, revenue
- Ad performance overview: spend, leads, CPL, cost per appointment
- Vorquali KPIs: Terminquote, No-Show rate
- Recharts visualizations with date range filters

### 💶 Finanzen
- Income/expense table with filters (Einnahme/Ausgabe)
- Invoice tracking with Zahlstatus
- Monthly revenue/expense Recharts charts
- Add finance record form

### 👤 Mitarbeiter (HR)
- Team member list with roles
- Add/edit team members
- Individual performance view linking to sales_performance

### 📋 Aufgaben
- Task board/list view with status filters
- Assignment to team members
- Time tracking (geplante_zeit vs ist_zeit)
- Due date indicators

## Entity Display
- Company selector/badge showing Haush Haush Digital UG or Viral Connect GmbH
- GF (Geschäftsführer) attribution where relevant

## Tech Stack
- React + TypeScript + Tailwind CSS
- Recharts for all data visualizations
- Supabase for auth, database, and RLS
- React Router for navigation
- Shadcn/ui components styled with dark navy/gold theme

