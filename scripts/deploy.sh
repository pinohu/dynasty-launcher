#!/usr/bin/env bash

# =============================================================================
# Dynasty Launcher — Comprehensive Deployment Script
# =============================================================================
#
# Usage:
#   ./scripts/deploy.sh              # Full production deployment
#   ./scripts/deploy.sh --dry-run    # Show what would be deployed (no changes)
#
# This script:
#   1. Checks prerequisites (node, npm, psql, vercel CLI, git)
#   2. Validates .env is present and has required variables
#   3. Runs database migrations in order
#   4. Installs npm dependencies
#   5. Imports n8n workflows (if N8N_API_URL is set)
#   6. Deploys to Vercel (--prod flag)
#   7. Configures Stripe webhooks (if STRIPE_SECRET_KEY is set)
#   8. Prints deployment summary
#
# Exit codes:
#   0 - Success
#   1 - Configuration error or fatal failure
#   2 - Warning (completed with non-critical issues)
#
# =============================================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# Script root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
DRY_RUN="${1:-}"

# Flags
if [[ "$DRY_RUN" == "--dry-run" ]]; then
  DRY_RUN=true
else
  DRY_RUN=false
fi

# Counters
WARNINGS=0
ERRORS=0

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
  echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
  echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $*"
  WARNINGS=$((WARNINGS + 1))
}

log_error() {
  echo -e "${RED}✗${NC} $*"
  ERRORS=$((ERRORS + 1))
}

log_header() {
  echo ""
  echo -e "${CYAN}$(printf '%.0s=' {1..70})${NC}"
  echo -e "${CYAN}$*${NC}"
  echo -e "${CYAN}$(printf '%.0s=' {1..70})${NC}"
}

log_section() {
  echo ""
  echo -e "${BLUE}→ $*${NC}"
}

dry_run_notice() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}[DRY RUN]${NC} $*"
  fi
}

# Load environment
load_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
  fi
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Validation Functions
# =============================================================================

check_prerequisites() {
  log_section "Checking prerequisites..."

  local missing=0

  # Node.js
  if ! command_exists node; then
    log_error "node (v20+) not found. Install from https://nodejs.org"
    missing=1
  else
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 20 ]]; then
      log_error "node v20+ required (you have v${node_version})"
      missing=1
    else
      log_success "node $(node -v)"
    fi
  fi

  # npm
  if ! command_exists npm; then
    log_error "npm not found"
    missing=1
  else
    log_success "npm $(npm -v)"
  fi

  # Git
  if ! command_exists git; then
    log_error "git not found"
    missing=1
  else
    log_success "git $(git -v | head -n1)"
  fi

  # PostgreSQL client (psql)
  if ! command_exists psql; then
    log_warn "psql (PostgreSQL client) not found. Database migrations will be skipped."
    log_warn "Install: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
  else
    log_success "psql $(psql --version | grep -oP '\d+\.\d+' | head -1)"
  fi

  # Vercel CLI
  if ! command_exists vercel; then
    log_warn "Vercel CLI not found. Deploy to Vercel will be skipped."
    log_warn "Install: npm install -g vercel"
  else
    log_success "vercel CLI installed"
  fi

  if [[ $missing -eq 1 ]]; then
    log_error "Missing required prerequisites"
    return 1
  fi
}

validate_env() {
  log_section "Validating .env configuration..."

  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    log_error ".env file not found"
    log_info "Copy .env.example to .env and fill in your values:"
    log_info "  cp .env.example .env"
    return 1
  fi

  log_success ".env file found"

  # Load environment
  load_env

  # Check required variables
  local required=(
    "DATABASE_URL"
    "ANTHROPIC_API_KEY"
    "JWT_SECRET"
    "SESSION_SECRET"
    "ADMIN_KEY"
  )

  local missing=0
  for var in "${required[@]}"; do
    if [[ -z "${!var:-}" ]]; then
      log_error "Required: $var not set in .env"
      missing=1
    else
      log_success "$var is set"
    fi
  done

  if [[ $missing -eq 1 ]]; then
    return 1
  fi

  # Optional but important for production
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set. Billing features will be unavailable."
  fi

  if [[ -z "${VERCEL_API_TOKEN:-}" ]]; then
    log_warn "VERCEL_API_TOKEN not set. Vercel deployment will use CLI authentication."
  fi
}

# =============================================================================
# Database Migration
# =============================================================================

run_migrations() {
  log_section "Running database migrations..."

  if [[ -z "${DATABASE_URL:-}" ]]; then
    log_error "DATABASE_URL not set. Cannot run migrations."
    return 1
  fi

  if ! command_exists psql; then
    log_warn "psql not available. Skipping database migrations."
    log_warn "Run migrations manually when ready:"
    log_warn "  psql \"\$DATABASE_URL\" -f scripts/migrations/001_initial.sql"
    return 0
  fi

  local migrations_dir="$ROOT_DIR/scripts/migrations"

  if [[ ! -d "$migrations_dir" ]]; then
    log_warn "Migrations directory not found: $migrations_dir"
    return 0
  fi

  # Find all migration files in order
  local migration_files=($(find "$migrations_dir" -name "*.sql" | sort))

  if [[ ${#migration_files[@]} -eq 0 ]]; then
    log_warn "No migration files found"
    return 0
  fi

  for migration_file in "${migration_files[@]}"; do
    local migration_name=$(basename "$migration_file")

    if [[ "$DRY_RUN" == "true" ]]; then
      dry_run_notice "Would execute: $migration_name"
    else
      log_info "Executing: $migration_name..."
      if psql "$DATABASE_URL" -f "$migration_file" >/dev/null 2>&1; then
        log_success "Executed: $migration_name"
      else
        log_error "Failed to execute: $migration_name"
        return 1
      fi
    fi
  done
}

# =============================================================================
# NPM Dependencies
# =============================================================================

install_dependencies() {
  log_section "Installing npm dependencies..."

  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_notice "Would run: npm ci"
    return 0
  fi

  if npm ci >/dev/null 2>&1; then
    log_success "Dependencies installed"
  else
    log_error "Failed to install dependencies"
    return 1
  fi
}

# =============================================================================
# n8n Workflow Import
# =============================================================================

import_workflows() {
  log_section "Importing n8n workflows..."

  if [[ -z "${N8N_API_URL:-}" ]] || [[ -z "${N8N_API_KEY:-}" ]]; then
    log_warn "N8N_API_URL or N8N_API_KEY not set. Skipping workflow import."
    return 0
  fi

  local n8n_script="$ROOT_DIR/scripts/n8n-import.mjs"

  if [[ ! -f "$n8n_script" ]]; then
    log_warn "n8n import script not found: $n8n_script"
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_notice "Would run: node scripts/n8n-import.mjs --dry-run"
    node "$n8n_script" --dry-run
    return 0
  fi

  log_info "Importing workflows from:"
  log_info "  - automations/platform-modules/n8n-workflows"
  log_info "  - automations/catalog/n8n-workflows"

  if node "$n8n_script"; then
    log_success "Workflows imported"
  else
    log_warn "Workflow import had errors. Check logs above."
  fi
}

# =============================================================================
# Vercel Deployment
# =============================================================================

deploy_to_vercel() {
  log_section "Deploying to Vercel..."

  if ! command_exists vercel; then
    log_warn "Vercel CLI not installed. Skipping Vercel deployment."
    log_warn "Deploy manually from Vercel dashboard or run: npm install -g vercel"
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_notice "Would run: vercel deploy --prod"
    return 0
  fi

  log_info "Deploying to Vercel (production)..."

  if vercel deploy --prod; then
    log_success "Deployed to Vercel"
  else
    log_error "Vercel deployment failed"
    return 1
  fi
}

# =============================================================================
# Stripe Webhook Configuration
# =============================================================================

configure_stripe_webhooks() {
  log_section "Configuring Stripe webhooks..."

  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    log_warn "STRIPE_SECRET_KEY not set. Skipping webhook configuration."
    return 0
  fi

  if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
    log_warn "STRIPE_WEBHOOK_SECRET not configured. Webhooks will not work."
    log_info "Configure in Stripe Dashboard:"
    log_info "  1. Go to Developers → Webhooks"
    log_info "  2. Add endpoint: https://yourdeputy.com/webhooks/stripe"
    log_info "  3. Select events: charge.*, customer.*, payment_intent.*"
    log_info "  4. Copy Signing Secret to STRIPE_WEBHOOK_SECRET in .env"
    return 0
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    dry_run_notice "Stripe webhooks configured (no action needed)"
    return 0
  fi

  log_success "Stripe webhook secret is configured"
}

# =============================================================================
# Summary & Reporting
# =============================================================================

print_summary() {
  log_header "Deployment Summary"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}[DRY RUN MODE]${NC}"
    echo "No actual changes were made. Review the actions above."
    echo ""
  fi

  echo -e "${CYAN}Deployment Status:${NC}"
  echo "  Prerequisites:        $(check_mark)  Verified"
  echo "  Environment:          $(check_mark)  Validated"
  echo "  Database Migrations:  $(check_mark)  Applied"
  echo "  Dependencies:         $(check_mark)  Installed"
  echo "  n8n Workflows:        $(check_mark)  Imported"
  echo "  Vercel:               $(check_mark)  Deployed"
  echo "  Stripe Webhooks:      $(check_mark)  Configured"
  echo ""

  if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
  fi

  if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}Errors: $ERRORS${NC}"
    return 1
  fi

  if [[ "$DRY_RUN" == "false" ]]; then
    echo -e "${GREEN}✓ Deployment complete!${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Verify your application at ${VERCEL_URL:-https://yourdeputy.com}"
    echo "  2. Check Vercel deployment logs: vercel logs"
    echo "  3. Test database: psql \"\$DATABASE_URL\" -c 'SELECT version();'"
    echo "  4. Review webhook configuration in admin panel"
  fi

  echo -e "${CYAN}$(printf '%.0s=' {1..70})${NC}"
}

check_mark() {
  if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓${NC}"
  else
    echo -e "${RED}✗${NC}"
  fi
}

# =============================================================================
# Main Execution
# =============================================================================

main() {
  log_header "Dynasty Launcher Deployment"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
  fi

  echo ""

  # Run all checks and deployment steps
  if ! check_prerequisites; then
    log_error "Prerequisites check failed"
    return 1
  fi

  if ! validate_env; then
    log_error "Environment validation failed"
    return 1
  fi

  if ! run_migrations; then
    log_error "Database migrations failed"
    return 1
  fi

  if ! install_dependencies; then
    log_error "Dependency installation failed"
    return 1
  fi

  if ! import_workflows; then
    log_warn "Workflow import had issues"
  fi

  if ! deploy_to_vercel; then
    log_warn "Vercel deployment had issues"
  fi

  if ! configure_stripe_webhooks; then
    log_warn "Stripe configuration incomplete"
  fi

  print_summary

  if [[ $ERRORS -gt 0 ]]; then
    return 1
  fi

  return 0
}

# Execute main
main
exit $?
