---
name: skill-library
description: Keyword router for dynasty-launcher's LIBRARY skill set — off-stack skills kept searchable without auto-loading. Invoke when asked about a language/framework/domain not active in this repo (Rust, Go, Kotlin, Flutter, Laravel, crypto, logistics, video, etc.).
---

# Library Router — dynasty-launcher

The DAILY set (see `.claude/DAILY.md`) is hand-picked for this repo's vanilla-JS + HTML + Vercel + Stripe/Clerk/Neon/Anthropic stack.

Everything below is **installed but not auto-loaded**. Mention these skills by name or ask for them via keyword to pull into context on demand.

## Language + framework index

| Keyword | Skills |
|---|---|
| rust, ownership, cargo | `rust-reviewer`, `rust-patterns`, `rust-testing`, `rust-build-resolver`, `/rust-review`, `/rust-test`, `/rust-build`, `rules/rust/*` |
| go, golang | `go-reviewer`, `golang-patterns`, `golang-testing`, `go-build-resolver`, `/go-review`, `/go-test`, `/go-build`, `rules/golang/*` |
| python, django, pytest | `python-reviewer`, `python-patterns`, `python-testing`, `django-patterns`, `django-tdd`, `django-security`, `django-verification`, `/python-review`, `rules/python/*` |
| java, spring, spring boot | `java-reviewer`, `java-coding-standards`, `java-build-resolver`, `jpa-patterns`, `springboot-patterns`, `springboot-security`, `springboot-tdd`, `springboot-verification`, `rules/java/*` |
| kotlin, coroutines, ktor, compose, android, kmp | `kotlin-reviewer`, `kotlin-patterns`, `kotlin-testing`, `kotlin-coroutines-flows`, `kotlin-ktor-patterns`, `kotlin-exposed-patterns`, `kotlin-build-resolver`, `compose-multiplatform-patterns`, `android-clean-architecture`, `/kotlin-review`, `/kotlin-test`, `/kotlin-build`, `/gradle-build`, `rules/kotlin/*` |
| swift, swiftui, ios, ipados, macos, visionos | `swiftui-patterns`, `swift-actor-persistence`, `swift-concurrency-6-2`, `swift-protocol-di-testing`, `foundation-models-on-device`, `liquid-glass-design`, `rules/swift/*` |
| c++, cpp, cmake, googletest | `cpp-reviewer`, `cpp-coding-standards`, `cpp-build-resolver`, `cpp-testing`, `/cpp-review`, `/cpp-test`, `/cpp-build`, `rules/cpp/*` |
| c#, csharp, .net, dotnet | `csharp-reviewer`, `csharp-testing`, `dotnet-patterns`, `rules/csharp/*` |
| php, laravel, eloquent | `laravel-patterns`, `laravel-tdd`, `laravel-security`, `laravel-verification`, `laravel-plugin-discovery`, `rules/php/*` |
| dart, flutter | `dart-flutter-patterns`, `flutter-reviewer`, `dart-build-resolver`, `/flutter-review`, `/flutter-test`, `/flutter-build`, `rules/dart/*` |
| perl | `perl-patterns`, `perl-testing`, `perl-security`, `rules/perl/*` |
| nestjs | `nestjs-patterns` |
| pytorch, ml training | `pytorch-build-resolver` |
| clickhouse, analytics warehouse | `clickhouse-io` |

## Domain index (not active in this repo)

| Keyword | Skills |
|---|---|
| crypto, solidity, evm, defi | `defi-amm-security`, `evm-token-decimals`, `nodejs-keccak256`, `llm-trading-agent-security` |
| logistics, supply chain, freight | `carrier-relationship-management`, `logistics-exception-management`, `customs-trade-compliance`, `returns-reverse-logistics` |
| manufacturing, procurement, quality | `production-scheduling`, `quality-nonconformance`, `inventory-demand-planning`, `energy-procurement` |
| video generation, editing | `videodb`, `remotion-video-creation`, `manim-video`, `ui-demo`, `video-editing` |
| document processing | `nutrient-document-processing`, `visa-doc-translate` |
| workspace apps | `google-workspace-ops`, `jira-integration`, `confluence` (promote if any get connected) |
| network, outreach graph | `connections-optimizer`, `social-graph-ranker` |
| plankton, ai hooks | `plankton-code-quality` (overlaps ECC hooks; skip unless replacing them) |
| bug bounty, pentesting | `security-bounty-hunter` |
| healthcare, PHI, HIPAA | `healthcare-reviewer`, `healthcare-phi-compliance`, `hipaa-compliance` (promote if healthcare archetype work heats up) |

## How to invoke

Either:
1. Mention the skill by name in a session ("use `healthcare-phi-compliance` to audit the PHI flow") — Claude Code will load it on demand.
2. Ask with a keyword ("review this for HIPAA") — this router returns the right skill pointer.
3. Run `/skill-stocktake` to re-audit the library periodically.

## Policy

- **Never install a library skill's auto-loading hook.** DAILY hooks already cover the stack.
- **Never promote a LIBRARY skill to DAILY without evidence.** Add a source file, dep, or vendor integration first.
- **Re-run `/agent-sort` after any major stack change** (adding TypeScript, introducing a framework, adding a new vendor module).
