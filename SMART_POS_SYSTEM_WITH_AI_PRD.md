📘 SMART POS SYSTEM WITH AI
Product Requirements Document (PRD) v1.1 (FINAL)

Status: Architecture decisions locked for MVP
Last Updated: March 27, 2026

1. 🧭 Product Overview
Product Name: SmartPOS Lanka (working name)
Type: Single-Shop POS (Installable + Offline-First + AI Assistant)
🎯 Vision

Build a zero-training, installable (computer + mobile), offline-capable POS system for small retailers that handles billing and provides smart business insights.

🧠 Core Concept

POS + Smart Assistant (not just billing software)

2. 🎯 Target Users
Grocery shops
Bookstores
Small clothing shops
General retail stores
User Personas
Owner: Business decision-maker
Cashier: Daily billing operator
Manager (V2+): Oversees operations
3. 🧩 Product Principles
One-screen selling experience
Works on computer + mobile devices
Installable like an app (PWA)
Zero-training UX
Offline-first architecture
AI as background assistant
Fast onboarding
Financial integrity first
4. 🏗️ System Architecture Overview
Frontend
React.js + Vite (SPA)
PWA-enabled (installable on desktop & mobile)
Tailwind CSS
Backend
ASP.NET Core (.NET 8)
REST API
Database
PostgreSQL / SQL Server
ACID transactions
Infrastructure
Azure / AWS
Redis (caching)
Firebase (notifications)
4.1 Store Model (Single-Shop)

Final decision: Single store system (no multi-tenant).

Rules
All data belongs to one business
No tenant isolation required
Simpler architecture for MVP
Future-ready (optional)
Add store_id for:
Multi-branch (V3)
Future SaaS upgrade
4.2 Installation & Device Strategy (NEW)
Supported Modes
1. PWA Installation (Primary)
Install via browser (Chrome/Edge)
Runs like a desktop app
Works offline
2. Browser Mode
Access via URL
No installation required
3. Future (V2+)
Desktop app (Electron) for advanced hardware control
Supported Devices
💻 Computer (Primary POS terminal)
📱 Mobile (secondary use)
📟 Tablet
5. 🧾 CORE MODULES
5.1 Sales & Checkout (Critical)
Features
One-screen billing UI
Product search (name/barcode)
Add/remove items
Quantity adjustment
Discounts
Hold/resume bill
Cancel/void bill
Multi-payment:
Cash
Card
QR (LankaQR)
Change calculation
Receipt:
Thermal print
Digital (WhatsApp)
🔐 Financial Integrity Rules (LOCKED)
Cancel/Void (before payment)
No ledger entry
Restore stock
Refund (after payment)
Must reference sale_id
Stock increases
Payment reversal recorded
Ledger reversal required
Partial refunds allowed
Tax reversed proportionally
Full audit trail required
Data Entities
sales
sale_items
inventory
payments
ledger
5.2 Product & Inventory
MVP
Product creation
Categories
Barcode support
Stock deduction
Manual adjustments
V2
Variants
Suppliers
Purchases
Expiry tracking
V3
Multi-branch inventory
Stock transfers
5.3 User & Role Management
Roles
Owner
Cashier
Manager
Features
RBAC
Discount limits
Refund permissions
Audit logs
5.4 Receipts & Sales History
Thermal printing
Digital receipts
Reprint
Refund tracking
5.5 Reporting System
MVP
Daily sales
Transactions
Payment breakdown
Top items
Low stock
V2 Profit Model (LOCKED)
COGS = avg_cost × quantity_sold
Profit = revenue - COGS
Method: Weighted Average Cost
6. 🧠 SMART DECISION SYSTEM

(No changes — already strong ✅)

7. 🤖 AI FEATURES

(No changes — solid roadmap ✅)

8. 📱 UX & OFFLINE SYNC DESIGN
8.1 UX Principles
One-screen checkout
Large touch targets
Minimal typing
Smart defaults
8.2 Offline Event Contract (UPDATED)
event_id (UUID)
store_id
device_id
device_timestamp
server_timestamp
type (sale/refund/stock_update)
payload (JSON)
status (pending/synced/conflict/rejected)
8.3 Sync Flow
Save event locally
Sync when online
Server validates + applies
Return status
UI updates
8.4 Conflict Rules
Case	Rule
Duplicate sale	Prevent via event_id
Stock conflict	Server is source of truth
Offline sale	Allow negative stock
Edit conflict	Last-write-wins
8.5 Reliability
Retry system
Idempotent processing
Error queue
Sync status UI
9. 🏢 BUSINESS FEATURES
V2
Suppliers
Purchases
Customers
Loyalty
V3
Multi-branch
Promotions
Campaigns
Accounting integration
10. 🔐 SECURITY & AUTHENTICATION
Auth Strategy
Platform	Method
Web/PWA	HttpOnly JWT cookie
Offline	Local session + device_id
Future mobile	Access + refresh token
Security
RBAC
Device tracking
Session expiry
Audit logs
11. ⚡ PERFORMANCE SLOs
Operation	Target
Offline checkout	< 300ms
Online checkout	p95 < 800ms
Sync API	p95 < 1.5s
Dashboard	< 2s
12. 🚀 ROADMAP
🟢 MVP
Installable PWA POS
Billing system
Offline sync engine
Inventory
Dashboard
Alerts
🟡 V2
Suppliers
Variants
Customers
Profit reports
🔵 V3
Multi-branch
AI assistant
Promotions
13. 📊 SUCCESS METRICS
Daily usage
Transactions
Sync success rate
Conflict rate
14. ✅ LAUNCH READINESS
Works on computer
Works offline
No duplicate sales
Easy onboarding
15. 📋 MVP BACKLOG (UPDATED)
Core
Remove tenant system
Add optional store_id
PWA setup (installable app)
Offline Sync
Events table
Local queue
Sync API
Conflict handling
Finance
Refund system
Ledger logic
Auth
JWT cookie
RBAC
16. 🧱 IMPLEMENTATION ORDER
Setup PWA (installable app)
Build offline sync system
Build checkout
Add inventory
Add reports
🧠 FINAL SUMMARY

This system is:

👉 Single-shop POS
👉 Installable on computer (PWA)
👉 Offline-first
👉 Financially accurate
👉 AI-assisted
👉 Future-ready (multi-branch possible)
🔥 Final Insight (Important)

Now your system is:

✅ Simpler than SaaS
✅ Faster to build
✅ Easier to sell to local shops
✅ Perfect for Sri Lankan market