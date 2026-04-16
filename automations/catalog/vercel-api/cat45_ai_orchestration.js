import { Pool } from '@neondatabase/serverless';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkWorkflowHealth(companyId) {
  const result = await pool.query(
    `SELECT
      workflow_id,
      workflow_name,
      last_run,
      status,
      error_count,
      success_rate,
      avg_execution_time
     FROM workflow_health
     WHERE company_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'
     ORDER BY error_count DESC`,
    [companyId]
  );

  const unhealthyWorkflows = result.rows.filter(w => w.error_count > 5 || w.success_rate < 0.8);

  if (unhealthyWorkflows.length > 0) {
    await pool.query(
      `INSERT INTO health_alerts (company_id, workflow_id, alert_type, severity, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [companyId, unhealthyWorkflows[0].workflow_id, 'LOW_SUCCESS_RATE', 'high']
    );
  }

  return { workflows: result.rows, unhealthy: unhealthyWorkflows };
}

async function handleFailover(companyId, failedWorkflowId) {
  const config = await pool.query(
    `SELECT primary_workflow, backup_workflow, failover_enabled FROM failover_config
     WHERE company_id = $1 AND primary_workflow = $2`,
    [companyId, failedWorkflowId]
  );

  if (config.rows.length === 0 || !config.rows[0].failover_enabled) {
    return { failover: false, reason: 'No failover configured' };
  }

  const backupWorkflow = config.rows[0].backup_workflow;

  await pool.query(
    `INSERT INTO failover_logs (company_id, primary_workflow, backup_workflow, triggered_at)
     VALUES ($1, $2, $3, NOW())`,
    [companyId, failedWorkflowId, backupWorkflow]
  );

  return { failover: true, activeWorkflow: backupWorkflow, switchedAt: new Date() };
}

async function coordinateTools(taskDescription, tools) {
  const toolStatuses = {};
  for (const tool of tools) {
    const status = await pool.query(
      `SELECT status FROM integration_status WHERE tool_name = $1`,
      [tool]
    );
    toolStatuses[tool] = status.rows[0]?.status || 'unknown';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Coordinate these tools for the task: "${taskDescription}". Tool status: ${JSON.stringify(toolStatuses)}`
      }]
    })
  });

  const completion = await response.json();
  return { coordination: completion.choices[0].message.content, toolStatus: toolStatuses };
}

async function decomposeTask(nlpInput) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: `Break down this task into automation subtasks: "${nlpInput}". Return JSON with: { subtasks: [...], automationTypes: [...], estimatedTime: ... }`
      }]
    })
  });

  const completion = await response.json();
  const decomposition = JSON.parse(completion.choices[0].message.content);

  const taskId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO task_decompositions (id, nlp_input, subtasks, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [taskId, nlpInput, JSON.stringify(decomposition)]
  );

  return { taskId, decomposition };
}

async function scoreAIResponse(response, criteria) {
  const scoringResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Score this AI response on criteria ${criteria.join(', ')}: "${response}". Return JSON: { overallScore: 0-100, scores: {} }`
      }]
    })
  });

  const result = await scoringResponse.json();
  const content = result.content[0].text;
  const scores = JSON.parse(content);

  await pool.query(
    `INSERT INTO response_quality_scores (response_text, score, criteria, scored_at)
     VALUES ($1, $2, $3, NOW())`,
    [response, scores.overallScore, JSON.stringify(criteria)]
  );

  return scores;
}

async function managePromptTemplates(action, companyId, templateData) {
  if (action === 'get') {
    const result = await pool.query(
      `SELECT template_id, template_name, template_content, category FROM prompt_templates
       WHERE company_id = $1 ORDER BY created_at DESC`,
      [companyId]
    );
    return { templates: result.rows };
  }

  if (action === 'save') {
    const templateId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO prompt_templates (id, company_id, template_name, template_content, category, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [templateId, companyId, templateData.name, templateData.content, templateData.category]
    );
    return { templateId, saved: true };
  }
}

async function trackAPICosts(companyId) {
  const result = await pool.query(
    `SELECT
      api_name,
      SUM(usage_count) as total_usage,
      SUM(cost) as total_cost,
      MAX(cost_date) as last_updated
     FROM api_usage_logs
     WHERE company_id = $1 AND cost_date > NOW() - INTERVAL '30 days'
     GROUP BY api_name
     ORDER BY total_cost DESC`,
    [companyId]
  );

  const totalCost = result.rows.reduce((sum, row) => sum + (parseFloat(row.total_cost) || 0), 0);
  const topExpensiveAPIs = result.rows.slice(0, 3);

  return {
    costBreakdown: result.rows,
    totalMonthly: totalCost,
    topExpensive: topExpensiveAPIs,
    optimizationOpportunities: topExpensiveAPIs.map(api => ({
      api: api.api_name,
      currentCost: api.total_cost,
      suggestion: `Optimize ${api.api_name} usage or switch providers`
    }))
  };
}

async function detectErrorPatterns(companyId) {
  const result = await pool.query(
    `SELECT
      error_type,
      error_message,
      frequency,
      last_occurrence,
      affected_workflows
     FROM error_patterns
     WHERE company_id = $1
     ORDER BY frequency DESC
     LIMIT 20`,
    [companyId]
  );

  const recurringErrors = result.rows.filter(e => e.frequency >= 3);
  const patterns = {
    total: result.rows.length,
    recurring: recurringErrors,
    commonErrors: recurringErrors.slice(0, 5),
    lastAnalyzed: new Date()
  };

  return patterns;
}

async function analyzeProcessMining(companyId) {
  const result = await pool.query(
    `SELECT
      process_step,
      COUNT(*) as executions,
      AVG(EXTRACT(EPOCH FROM duration)) as avg_duration_seconds,
      MAX(EXTRACT(EPOCH FROM duration)) as max_duration_seconds,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
     FROM process_logs
     WHERE company_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY process_step
     ORDER BY avg_duration_seconds DESC`,
    [companyId]
  );

  const bottlenecks = result.rows.filter(p => p.avg_duration_seconds > 60);
  const insights = {
    totalProcesses: result.rows.length,
    bottlenecks: bottlenecks,
    recommendations: bottlenecks.map(b => ({
      step: b.process_step,
      avgTime: b.avg_duration_seconds,
      recommendation: `Optimize ${b.process_step}: ${b.failures > 0 ? 'High failure rate detected' : 'Performance could be improved'}`
    }))
  };

  return insights;
}

async function intelligentTaskRouter(requestType, priority, companyId) {
  const result = await pool.query(
    `SELECT
      automation_id,
      automation_name,
      success_rate,
      avg_execution_time,
      cost_per_execution
     FROM intelligent_routing
     WHERE request_type = $1 AND success_rate > 0.75
     ORDER BY success_rate DESC, cost_per_execution ASC
     LIMIT 1`,
    [requestType]
  );

  if (result.rows.length === 0) {
    return { routed: false, reason: 'No suitable automation found' };
  }

  const selectedAutomation = result.rows[0];

  await pool.query(
    `INSERT INTO routing_decisions (company_id, request_type, selected_automation, priority, routed_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [companyId, requestType, selectedAutomation.automation_id, priority]
  );

  return { routed: true, selectedAutomation, routing_confidence: selectedAutomation.success_rate };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, companyId, taskDescription, tools, nlpInput, response, criteria, templateAction, templateData, requestType, priority, failedWorkflow } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action parameter' });
    }

    let result;

    switch (action) {
      case 'health_check':
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
        result = await checkWorkflowHealth(companyId);
        break;

      case 'failover':
        if (!companyId || !failedWorkflow) return res.status(400).json({ error: 'Missing companyId or failedWorkflow' });
        result = await handleFailover(companyId, failedWorkflow);
        break;

      case 'coordinate_tools':
        if (!taskDescription || !tools) return res.status(400).json({ error: 'Missing taskDescription or tools' });
        result = await coordinateTools(taskDescription, tools);
        break;

      case 'decompose_task':
        if (!nlpInput) return res.status(400).json({ error: 'Missing nlpInput' });
        result = await decomposeTask(nlpInput);
        break;

      case 'score_response':
        if (!response || !criteria) return res.status(400).json({ error: 'Missing response or criteria' });
        result = await scoreAIResponse(response, criteria);
        break;

      case 'prompt_templates':
        if (!templateAction || !companyId) return res.status(400).json({ error: 'Missing templateAction or companyId' });
        result = await managePromptTemplates(templateAction, companyId, templateData);
        break;

      case 'api_costs':
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
        result = await trackAPICosts(companyId);
        break;

      case 'error_patterns':
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
        result = await detectErrorPatterns(companyId);
        break;

      case 'process_mining':
        if (!companyId) return res.status(400).json({ error: 'Missing companyId' });
        result = await analyzeProcessMining(companyId);
        break;

      case 'task_router':
        if (!requestType || !companyId) return res.status(400).json({ error: 'Missing requestType or companyId' });
        result = await intelligentTaskRouter(requestType, priority || 'normal', companyId);
        break;

      default:
        return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('AI Orchestration error:', error);
    return res.status(500).json({
      error: 'AI orchestration failed',
      message: error.message
    });
  }
}
