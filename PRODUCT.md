# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Enterprise customers are the primary audience. Downstream customers consume Linfei Technology's LLM token API and use the customer console to manage usage and top-ups.

## Product Purpose

New API connects upstream model services to a consistent API and provides a web console for managing access, routing, usage, and costs. It supports sharing authorized model access within a team, switching providers without reconfiguring every client, and operating a private multi-model service.

## Positioning

The gateway brings multiple upstream model providers together behind a unified API and management console, while allowing customers to deploy it themselves.

## Operating Context

Operators configure providers and models, manage users and credentials, and monitor usage and costs. Developers and applications consume model services through the gateway API. The repository also includes an Electron wrapper for the web interface.

## Capabilities and Constraints

- The gateway supports multiple upstream providers and includes access control, billing, rate limiting, usage logs, and an administrative dashboard.
- The web console supports English, Simplified Chinese, Traditional Chinese, French, Japanese, Russian, and Vietnamese.
- Primary database behavior must remain compatible with SQLite, MySQL, and PostgreSQL.
- Upstream access must be authorized; project use must respect applicable provider terms and laws.
- Customer-facing branding uses 麟飞科技 while preserving upstream copyright, licenses, and author attribution.

## Brand Commitments

The customer-facing company is Linfei Technology (麟飞科技). No company logo or brand guide was supplied. The approved homepage uses a blue visual system and a single generated optical-ribbon image. The user pinned the official Google Chrome website as the default public homepage design reference and Google Sans as the global default UI font, preserving explicit font preferences.

Use 麟飞科技 as the customer-facing product brand. Preserve New API / QuantumNous / One API attribution and legal notices. The project owner explicitly authorized this branding change.

## Evidence on Hand

The repository README describes the gateway and its capabilities. Screenshots in `assets/screenshots/` illustrate the dashboard, marketplace, models, and usage logs with simulated data; they are not customer evidence.

## Product Principles

- Support enterprise teams in operating and consuming model services through a shared gateway.
- Make model access, routing, usage, and costs manageable in one place.
- Preserve provider flexibility and self-hosted operation.
- Respect authorization, security, and upstream project attribution.

## Accessibility & Inclusion

The web project's conventions require keyboard accessibility, semantic markup, and WCAG 2.1 AA text contrast.
