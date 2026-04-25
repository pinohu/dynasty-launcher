const REVO_ENTITIES = [
  'tenants',
  'vpc_deployments',
  'integration_configs',
  'revenue_goals',
  'orchestration_workflows',
  'performance_snapshots',
  'xai_actions',
  'audit_logs',
];

const REVO_ENDPOINTS = [
  '/api/v1/vpc/provision',
  '/api/v1/vpc/status',
  '/api/v1/integrations/connect',
  '/api/v1/integrations/health',
  '/api/v1/workflows/deploy',
  '/api/v1/workflows/active',
  '/api/v1/xai/rationale',
  '/api/v1/revenue/performance',
  '/api/v1/revenue/baseline',
  '/api/v1/audit/compliance',
];

const REVO_ENV_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'API_KEY_ADMIN',
  'ALLOWED_ORIGINS',
  'SFDC_CLIENT_ID',
  'SFDC_CLIENT_SECRET',
  'HUBSPOT_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CHARGEBEE_SITE',
  'CHARGEBEE_API_KEY',
  'MIXPANEL_TOKEN',
  'TERRAFORM_PATH',
  'TF_STATE_BUCKET',
  'K8S_CONFIG_PATH',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
];

const STALE_REVO_PATHS = [
  /^src\//,
  /^app\//,
  /^types\//,
  /^auth\.ts$/,
  /^next\.config\.(?:js|mjs|ts)$/,
  /^tailwind\.config\.(?:js|mjs|ts)$/,
  /^postcss\.config\.(?:js|mjs|ts)$/,
  /^frontend\/\.github\//,
  /\.tmp$/,
];

function hasPath(files, path) {
  return Object.prototype.hasOwnProperty.call(files, path);
}

function text(files, path) {
  const value = files[path];
  return typeof value === 'string' ? value : '';
}

function issue(code, message, paths = [], severity = 'high') {
  return { code, message, paths, severity };
}

function isRevoContract(contract = {}) {
  const haystack = JSON.stringify(contract).toLowerCase();
  return /\brevos\b|byoc|vpc_deployments|xai_actions|revenue_goals/.test(haystack);
}

export function detectGeneratedRepoIssues(files, contract = {}) {
  const issues = [];
  const paths = Object.keys(files || {});
  const hasRootSrcApp = paths.some((p) => p.startsWith('src/app/'));
  const hasRootApp = paths.some((p) => p.startsWith('app/'));
  const hasFrontendApp = paths.some((p) => p.startsWith('frontend/app/'));
  const hasBackend = paths.some((p) => p.startsWith('backend/'));
  const revo = isRevoContract(contract) || hasPath(files, 'SPEC.md') && /RevOS|BYOC|xai_actions|revenue_goals/i.test(text(files, 'SPEC.md'));

  if ([hasRootSrcApp, hasRootApp, hasFrontendApp].filter(Boolean).length > 1) {
    issues.push(issue('duplicate_next_trees', 'Multiple Next.js app trees are present; routing will be ambiguous.', paths.filter((p) => /^(src\/app|app|frontend\/app)\//.test(p)).slice(0, 12), 'critical'));
  }
  if (revo && (!hasFrontendApp || !hasBackend)) {
    issues.push(issue('wrong_canonical_layout', 'RevOS/BYOC products must use frontend/ + backend/ as the canonical app layout.', [], 'critical'));
  }

  const stale = paths.filter((p) => STALE_REVO_PATHS.some((re) => re.test(p)));
  if (revo && stale.length) {
    issues.push(issue('template_residue', 'Stale root app/template files must be quarantined or removed for RevOS builds.', stale.slice(0, 20), 'high'));
  }

  const sourcePaths = paths.filter((p) => /^(backend|frontend|migrations|terraform|k8s|src|app|types)\//.test(p) || ['package.json', '.env.example'].includes(p));
  const domainDrift = sourcePaths.filter((p) => /ventures|agents/i.test(p) || /ventures|agents/i.test(text(files, p))).slice(0, 20);
  if (revo && domainDrift.length) {
    issues.push(issue('domain_drift', 'Generated code contains Ventures/Agents template language instead of RevOS concepts.', domainDrift, 'critical'));
  }

  const backend = text(files, 'backend/main.py');
  if (revo) {
    const missingEntities = REVO_ENTITIES.filter((entity) => !backend.includes(entity));
    if (missingEntities.length) {
      issues.push(issue('backend_schema_drift', `Backend is missing RevOS entities: ${missingEntities.join(', ')}.`, ['backend/main.py'], 'critical'));
    }
    const missingEndpoints = REVO_ENDPOINTS.filter((endpoint) => !backend.includes(endpoint));
    if (missingEndpoints.length) {
      issues.push(issue('api_contract_drift', `Backend is missing spec endpoints: ${missingEndpoints.join(', ')}.`, ['backend/main.py'], 'critical'));
    }
    if (/create_all\s*\(/.test(backend)) {
      issues.push(issue('import_time_schema_creation', 'Backend creates database tables at import time instead of using migrations.', ['backend/main.py'], 'high'));
    }
    if (/allow_origins\s*=\s*\[\s*["']\*["']\s*\]/.test(backend)) {
      issues.push(issue('wildcard_cors', 'Backend uses wildcard CORS for a sovereignty product.', ['backend/main.py'], 'high'));
    }
  }

  const migrationText = paths.filter((p) => /^migrations\/versions\/.*\.py$/.test(p)).map((p) => text(files, p)).join('\n');
  if (revo) {
    const missingMigrationEntities = REVO_ENTITIES.filter((entity) => !migrationText.includes(entity));
    if (missingMigrationEntities.length) {
      issues.push(issue('migration_schema_drift', `Migrations are missing RevOS tables: ${missingMigrationEntities.join(', ')}.`, paths.filter((p) => /^migrations\//.test(p)).slice(0, 8), 'critical'));
    }
  }

  const allText = sourcePaths.map((p) => `${p}\n${text(files, p)}`).join('\n');
  if (/ignoreBuildErrors\s*:\s*true|ignoreDuringBuilds\s*:\s*true/.test(allText)) {
    issues.push(issue('build_error_suppression', 'Generated project suppresses TypeScript or ESLint build failures.', paths.filter((p) => /next\.config/.test(p)), 'critical'));
  }
  if (/\b(change-me|your-secret-key|demo123|demo@example\.com)\b/i.test(allText)) {
    issues.push(issue('security_placeholder', 'Generated project contains hardcoded fallback secrets or demo credentials.', [], 'critical'));
  }
  if (/\bconsole\.log\s*\(/.test(allText)) {
    issues.push(issue('console_log', 'Generated source contains console.log statements.', [], 'medium'));
  }
  if (/\bany\s+as\s+any\b|:\s*any\b/.test(allText)) {
    issues.push(issue('typescript_any', 'Generated TypeScript contains unsafe any usage.', [], 'medium'));
  }

  const env = text(files, '.env.example') + '\n' + text(files, 'frontend/.env.example');
  if (revo) {
    const missingEnv = REVO_ENV_KEYS.filter((key) => !env.includes(key));
    if (missingEnv.length) {
      issues.push(issue('env_contract_drift', `Environment example is missing keys: ${missingEnv.join(', ')}.`, ['.env.example', 'frontend/.env.example'].filter((p) => hasPath(files, p)), 'high'));
    }
    if (!paths.some((p) => /^terraform\/.*\.tf$/.test(p)) || !paths.some((p) => /^k8s\/.*\.ya?ml$/.test(p))) {
      issues.push(issue('missing_byoc_infra', 'RevOS P0 requires Terraform and Kubernetes scaffold files.', [], 'critical'));
    }
  }

  return { ok: issues.length === 0, issues };
}

export function repairGeneratedRepoIssues(files, contract = {}) {
  const out = { ...(files || {}) };
  const telemetry = [];
  const revo = isRevoContract(contract) || hasPath(out, 'SPEC.md') && /RevOS|BYOC|xai_actions|revenue_goals/i.test(text(out, 'SPEC.md'));
  if (!revo) return { files: out, telemetry };

  for (const path of Object.keys(out)) {
    if (
      STALE_REVO_PATHS.some((re) => re.test(path))
      || /(?:^|\/)(?:ventures|agents)(?:\/|\.|$)/i.test(path)
      || /^migrations\/versions\/.*\.py$/.test(path)
    ) {
      delete out[path];
      telemetry.push({ code: 'template_residue', action: 'delete', path, reason: 'non-canonical RevOS duplicate or temporary file' });
    }
  }

  out['.env.example'] = buildRevoEnvExample();
  telemetry.push({ code: 'env_contract_drift', action: 'replace', path: '.env.example' });

  out['backend/main.py'] = buildRevoFastApi();
  out['backend/models.py'] = buildRevoModels();
  out['backend/requirements.txt'] = buildBackendRequirements();
  out['migrations/versions/001_revos_schema.py'] = buildRevoMigration();
  out['terraform/main.tf'] = buildTerraformMain();
  out['terraform/variables.tf'] = buildTerraformVariables();
  out['k8s/deployment.yaml'] = buildK8sDeployment();
  out['k8s/service.yaml'] = buildK8sService();
  out['frontend/app/page.tsx'] = buildRevoFrontendPage();
  out['frontend/package.json'] = buildFrontendPackageJson();
  out['frontend/next.config.js'] = 'const nextConfig = {};\nmodule.exports = nextConfig;\n';
  out['BUILD-REPORT.json'] = JSON.stringify({
    generated_at: new Date().toISOString(),
    status: 'repaired',
    repair_engine: 'dynasty-generated-repo-repair',
    telemetry,
  }, null, 2);
  telemetry.push({ code: 'revo_scaffold', action: 'replace', path: 'backend/main.py' });

  return { files: out, telemetry };
}

export function verifyGeneratedRepo(files, contract = {}) {
  const first = detectGeneratedRepoIssues(files, contract);
  return {
    ok: first.ok,
    checks: {
      contract: first.issues.filter((i) => i.severity === 'critical').length === 0,
      quality: first.issues.length === 0,
      routes: REVO_ENDPOINTS.every((endpoint) => text(files, 'backend/main.py').includes(endpoint)),
      byoc: Object.keys(files).some((p) => /^terraform\/.*\.tf$/.test(p)) && Object.keys(files).some((p) => /^k8s\/.*\.ya?ml$/.test(p)),
    },
    issues: first.issues,
  };
}

export function buildRepairTelemetry(before, after, telemetry) {
  return {
    generated_at: new Date().toISOString(),
    repair_engine: 'dynasty-generated-repo-repair',
    before_issue_count: before?.issues?.length || 0,
    after_issue_count: after?.issues?.length || 0,
    verification_ok: !!after?.ok,
    actions: telemetry || [],
  };
}

function buildRevoEnvExample() {
  return `${REVO_ENV_KEYS.map((key) => `${key}=`).join('\n')}\n`;
}

function buildBackendRequirements() {
  return [
    'fastapi==0.115.6',
    'uvicorn[standard]==0.32.1',
    'sqlalchemy==2.0.36',
    'psycopg[binary]==3.2.3',
    'pydantic==2.10.3',
    'python-dotenv==1.0.1',
    'alembic==1.14.0',
  ].join('\n') + '\n';
}

function buildRevoFastApi() {
  return `from datetime import date, datetime
from decimal import Decimal
from os import getenv
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = getenv("DATABASE_URL")
JWT_SECRET = getenv("JWT_SECRET")
API_KEY_ADMIN = getenv("API_KEY_ADMIN")
ALLOWED_ORIGINS = [origin.strip() for origin in getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if origin.strip()]

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")
if not JWT_SECRET and not API_KEY_ADMIN:
    raise RuntimeError("JWT_SECRET or API_KEY_ADMIN is required")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    company_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    arr_tier: Mapped[str] = mapped_column(String(50), default="mid-market", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class VpcDeployment(Base):
    __tablename__ = "vpc_deployments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    cloud_provider: Mapped[str] = mapped_column(String(50), nullable=False)
    region: Mapped[str] = mapped_column(String(80), nullable=False)
    cluster_endpoint: Mapped[str | None] = mapped_column(Text)
    deployment_status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    auth_payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    sync_status: Mapped[str] = mapped_column(String(50), default="disconnected", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class RevenueGoal(Base):
    __tablename__ = "revenue_goals"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    baseline_arr: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    target_arr: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class OrchestrationWorkflow(Base):
    __tablename__ = "orchestration_workflows"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    trigger_event: Mapped[str] = mapped_column(String(100), nullable=False)
    logic_chain: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PerformanceSnapshot(Base):
    __tablename__ = "performance_snapshots"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    current_arr: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    incremental_gain: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class XaiAction(Base):
    __tablename__ = "xai_actions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    evidence: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class BaselineRequest(BaseModel):
    tenantId: UUID
    baselineArr: Decimal = Field(gt=0)
    targetArr: Decimal = Field(gt=0)


class ProvisionRequest(BaseModel):
    tenantId: UUID
    cloudProvider: str
    region: str
    clusterSize: str


class IntegrationRequest(BaseModel):
    tenantId: UUID
    provider: str
    authPayload: dict


class WorkflowRequest(BaseModel):
    tenantId: UUID
    triggerEvent: str
    logicChain: list


app = FastAPI(title="AI Collision Deploy RevOS API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_role(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    if API_KEY_ADMIN and x_api_key == API_KEY_ADMIN:
        return {"role": "admin"}
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "unauthorized", "message": "Invalid or expired token"})


def audit(db: Session, tenant_id: str, event_type: str, payload: dict):
    db.add(AuditLog(tenant_id=tenant_id, event_type=event_type, payload=payload))


@app.middleware("http")
async def audit_request_id(request: Request, call_next):
    request.state.request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.get("/health")
def health():
    return {"data": {"status": "ok"}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.post("/api/v1/revenue/baseline")
def set_revenue_baseline(payload: BaselineRequest, db: Session = Depends(get_db), _principal=Depends(require_role)):
    tenant_id = str(payload.tenantId)
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail={"error": "tenant_not_found", "message": "Tenant does not exist"})
    if payload.targetArr <= payload.baselineArr:
        raise HTTPException(status_code=422, detail={"error": "invalid_target", "message": "targetArr must be greater than baselineArr"})
    goal = RevenueGoal(tenant_id=tenant_id, baseline_arr=payload.baselineArr, target_arr=payload.targetArr)
    db.add(goal)
    audit(db, tenant_id, "revenue_baseline_created", {"goal_id": goal.id, "baseline_arr": str(payload.baselineArr), "target_arr": str(payload.targetArr)})
    db.commit()
    return {"data": {"goalId": goal.id, "periodStart": str(goal.period_start)}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/revenue/performance")
def revenue_performance(tenantId: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    rows = db.scalars(select(PerformanceSnapshot).where(PerformanceSnapshot.tenant_id == str(tenantId))).all()
    return {"data": {"snapshots": [{"currentArr": str(r.current_arr), "incrementalGain": str(r.incremental_gain), "capturedAt": r.captured_at.isoformat()} for r in rows]}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.post("/api/v1/vpc/provision", status_code=202)
def provision_vpc(payload: ProvisionRequest, db: Session = Depends(get_db), _principal=Depends(require_role)):
    job_id = str(uuid4())
    deployment = VpcDeployment(tenant_id=str(payload.tenantId), cloud_provider=payload.cloudProvider, region=payload.region, deployment_status="provisioning")
    db.add(deployment)
    audit(db, str(payload.tenantId), "vpc_provision_requested", {"job_id": job_id, "cloud_provider": payload.cloudProvider, "region": payload.region})
    db.commit()
    return {"data": {"jobId": job_id, "estimatedTime": 1800}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/vpc/status")
def vpc_status(tenantId: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    row = db.scalars(select(VpcDeployment).where(VpcDeployment.tenant_id == str(tenantId))).first()
    return {"data": {"status": row.deployment_status if row else "not_provisioned", "endpoint": row.cluster_endpoint if row else None}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.post("/api/v1/integrations/connect")
def connect_integration(payload: IntegrationRequest, db: Session = Depends(get_db), _principal=Depends(require_role)):
    cfg = IntegrationConfig(tenant_id=str(payload.tenantId), provider=payload.provider, auth_payload={"redacted": True}, sync_status="connected")
    db.add(cfg)
    audit(db, str(payload.tenantId), "integration_connected", {"integration_id": cfg.id, "provider": payload.provider})
    db.commit()
    return {"data": {"integrationId": cfg.id, "syncStatus": cfg.sync_status}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/integrations/health")
def integrations_health(tenantId: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    rows = db.scalars(select(IntegrationConfig).where(IntegrationConfig.tenant_id == str(tenantId))).all()
    return {"data": {"integrations": [{"provider": r.provider, "syncStatus": r.sync_status} for r in rows]}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.post("/api/v1/workflows/deploy")
def deploy_workflow(payload: WorkflowRequest, db: Session = Depends(get_db), _principal=Depends(require_role)):
    wf = OrchestrationWorkflow(tenant_id=str(payload.tenantId), trigger_event=payload.triggerEvent, logic_chain=payload.logicChain, is_active=True)
    db.add(wf)
    audit(db, str(payload.tenantId), "workflow_deployed", {"workflow_id": wf.id, "trigger_event": payload.triggerEvent})
    db.commit()
    return {"data": {"workflowId": wf.id, "status": "deployed"}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/workflows/active")
def active_workflows(tenantId: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    rows = db.scalars(select(OrchestrationWorkflow).where(OrchestrationWorkflow.tenant_id == str(tenantId), OrchestrationWorkflow.is_active == True)).all()
    return {"data": {"workflows": [{"workflowId": r.id, "triggerEvent": r.trigger_event} for r in rows]}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/xai/rationale/{action_id}")
def xai_rationale(action_id: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    row = db.get(XaiAction, str(action_id))
    if not row:
        raise HTTPException(status_code=404, detail={"error": "xai_action_not_found", "message": "Action does not exist"})
    return {"data": {"actionId": row.id, "rationale": row.rationale, "confidenceScore": str(row.confidence_score), "evidence": row.evidence}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}


@app.get("/api/v1/audit/compliance")
def audit_compliance(tenantId: UUID, db: Session = Depends(get_db), _principal=Depends(require_role)):
    rows = db.scalars(select(AuditLog).where(AuditLog.tenant_id == str(tenantId))).all()
    return {"data": {"logs": [{"eventType": r.event_type, "payload": r.payload, "timestamp": r.timestamp.isoformat()} for r in rows], "totalEvents": len(rows), "complianceStatus": "compliant"}, "meta": {"timestamp": datetime.utcnow().isoformat(), "version": "v1"}}
`;
}

function buildRevoModels() {
  return 'from backend.main import AuditLog, Base, IntegrationConfig, OrchestrationWorkflow, PerformanceSnapshot, RevenueGoal, Tenant, VpcDeployment, XaiAction\n';
}

function buildRevoMigration() {
  return `"""RevOS canonical schema

Revision ID: 001_revos_schema
Revises:
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "001_revos_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.create_table("tenants", sa.Column("id", sa.String(), primary_key=True), sa.Column("company_name", sa.String(255), nullable=False, unique=True), sa.Column("arr_tier", sa.String(50), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_table("vpc_deployments", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("cloud_provider", sa.String(50), nullable=False), sa.Column("region", sa.String(80), nullable=False), sa.Column("cluster_endpoint", sa.Text()), sa.Column("deployment_status", sa.String(50), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("integration_configs", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("provider", sa.String(50), nullable=False), sa.Column("auth_payload", sa.JSON(), nullable=False), sa.Column("sync_status", sa.String(50), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_table("revenue_goals", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("baseline_arr", sa.Numeric(15, 2), nullable=False), sa.Column("target_arr", sa.Numeric(15, 2), nullable=False), sa.Column("period_start", sa.Date(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("orchestration_workflows", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("trigger_event", sa.String(100), nullable=False), sa.Column("logic_chain", sa.JSON(), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False))
    op.create_table("performance_snapshots", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("current_arr", sa.Numeric(15, 2), nullable=False), sa.Column("incremental_gain", sa.Numeric(15, 2), nullable=False), sa.Column("captured_at", sa.DateTime(), nullable=False))
    op.create_table("xai_actions", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("action_type", sa.String(100), nullable=False), sa.Column("rationale", sa.Text(), nullable=False), sa.Column("confidence_score", sa.Numeric(3, 2), nullable=False), sa.Column("evidence", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False))
    op.create_table("audit_logs", sa.Column("id", sa.String(), primary_key=True), sa.Column("tenant_id", sa.String(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("event_type", sa.String(100), nullable=False), sa.Column("payload", sa.JSON(), nullable=False), sa.Column("timestamp", sa.DateTime(), nullable=False))


def downgrade():
    for table in ["audit_logs", "xai_actions", "performance_snapshots", "orchestration_workflows", "revenue_goals", "integration_configs", "vpc_deployments", "tenants"]:
        op.drop_table(table)
`;
}

function buildTerraformMain() {
  return `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

module "revos_eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.29"
  subnet_ids      = var.private_subnet_ids
  vpc_id          = var.vpc_id
}
`;
}

function buildTerraformVariables() {
  return `variable "aws_region" { type = string }
variable "cluster_name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
`;
}

function buildK8sDeployment() {
  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: revos-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: revos-api
  template:
    metadata:
      labels:
        app: revos-api
    spec:
      containers:
        - name: api
          image: ghcr.io/pinohu/ai-collision-deploy-api:latest
          ports:
            - containerPort: 8000
          envFrom:
            - secretRef:
                name: revos-api-env
`;
}

function buildK8sService() {
  return `apiVersion: v1
kind: Service
metadata:
  name: revos-api
spec:
  type: ClusterIP
  selector:
    app: revos-api
  ports:
    - port: 80
      targetPort: 8000
`;
}

function buildRevoFrontendPage() {
  return `const metrics = [
  ['VPC status', 'Provisioning-ready'],
  ['Baseline ARR', 'Awaiting secure input'],
  ['XAI coverage', '100% required'],
  ['Audit posture', 'Immutable log enabled'],
];

export default function Page() {
  return (
    <main className="min-h-screen bg-[#080B10] text-[#F4F7FB]">
      <section className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#C9A84C]">RevOS sovereign revenue layer</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-bold">AI Collision Deploy</h1>
          <p className="mt-4 max-w-3xl text-[#AAB4C0]">BYOC revenue orchestration for regulated B2B SaaS teams. Connect CRM and billing systems, set baseline ARR, deploy audited workflows, and inspect every XAI rationale without moving customer data out of the client perimeter.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="border border-[#253040] bg-[#101722] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-[#7E8A99]">{label}</p>
              <p className="mt-3 text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <section className="grid gap-4 md:grid-cols-2">
          <div className="border border-[#253040] bg-[#101722] p-5">
            <h2 className="text-xl font-semibold">Revenue baseline</h2>
            <p className="mt-2 text-sm text-[#AAB4C0]">POST /api/v1/revenue/baseline creates the measurable ARR starting point and writes an audit event.</p>
          </div>
          <div className="border border-[#253040] bg-[#101722] p-5">
            <h2 className="text-xl font-semibold">Compliance trail</h2>
            <p className="mt-2 text-sm text-[#AAB4C0]">GET /api/v1/audit/compliance exports tenant-scoped system events for CISO review.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
`;
}

function buildFrontendPackageJson() {
  return JSON.stringify({
    name: 'ai-collision-deploy-frontend',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      '@next/eslint-plugin-next': '^15.2.4',
      next: '^15.2.4',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      'lucide-react': '^0.468.0',
    },
    devDependencies: {
      '@types/node': '^20',
      '@types/react': '^18',
      '@types/react-dom': '^18',
      typescript: '^5',
      eslint: '^8',
      'eslint-config-next': '15.2.4',
    },
  }, null, 2) + '\n';
}
