# Mentor LMS (eduportal)

**Mentor** is a multi-tenant Learning Management System (LMS) for corporate knowledge management. It enables companies to create, assign, and track educational modules for their employees — with AI-assisted content creation, quizzes, certificates, real-time chat, gamification (XP, leaderboards, rewards store), and live training events with attendance tracking.

## Main Use Case

A company (tenant) signs up and creates structured learning modules for its employees. Admins and mentors author content (text, video, documents), assign modules to employee groups with optional deadlines, and track completion progress. Employees work through sections, take quizzes, earn certificates, and communicate with mentors via per-module chat rooms. An AI Module Builder can generate entire modules from video transcripts or uploaded documents. A gamification system awards XP for learning activities, with a leaderboard, ranks, and a rewards storefront where employees can spend XP. Live training events support online, physical, and hybrid locations with attendance tracking and XP rewards. Knowledge suggestions let employees propose and vote on new topics, earning XP for contributions.

## High-Level Flow

```
Tenant (Company)
  |
  +-- Admin / Mentor
  |     |-- Create Modules (text, video, docs)
  |     |-- AI-generate modules from video/text/PDF
  |     |-- AI-assist: titles, descriptions, tags, quizzes, cover images
  |     |-- Assign modules to Groups with deadlines
  |     |-- Monitor progress, override completions
  |     |-- Schedule live events (online/physical/hybrid) with materials
  |     |-- Confirm event attendance (individual + bulk) → awards XP
  |     |-- Manage Radar (curated content feed)
  |     |-- Manage rewards store and review redemptions
  |     |-- Review and approve knowledge suggestions
  |     +-- View audit logs, analytics, compliance
  |
  +-- Employee
        |-- Browse assigned modules
        |-- Complete sections (text, video, attachments)
        |-- Take quizzes
        |-- Earn certificates and XP
        |-- Chat with mentors per module
        |-- Register for live events
        |-- Suggest knowledge topics (+10 XP)
        |-- Redeem XP in rewards store
        +-- View Radar feed, leaderboard
```

## Documentation Index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, modules, data flow |
| [TECH_STACK.md](./TECH_STACK.md) | Runtime, frameworks, databases, integrations |
| [DB_SCHEMA.md](./DB_SCHEMA.md) | Database tables, relations, indexes |
| [API.md](./API.md) | API endpoints, auth, examples |
| [SETUP.md](./SETUP.md) | Local development setup |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Build, deploy, CI/CD, env vars |
| [OPERATIONS.md](./OPERATIONS.md) | Monitoring, backup, debugging |
| [SECURITY.md](./SECURITY.md) | Auth model, RBAC, secrets, vulnerabilities |
| [DECISIONS.md](./DECISIONS.md) | Architectural Decision Records (ADR) |
| [CHANGELOG.md](./CHANGELOG.md) | Development history and milestones |
| [SNAPSHOT.json](./SNAPSHOT.json) | Machine-readable stack summary |

## Quick Start

```bash
git clone <repo-url> && cd eduportal
npm install
cp .env.example .env.local   # fill in required values
npx prisma db push
npx prisma db seed
npm run dev                   # http://localhost:3000
```

See [SETUP.md](./SETUP.md) for detailed instructions.
