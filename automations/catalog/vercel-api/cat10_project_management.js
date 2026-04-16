import express from 'express';
import { Pool } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const mailer = nodemailer.createTransport({
  host: 'smtp.acumbamail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.ACUMBAMAIL_USER,
    pass: process.env.ACUMBAMAIL_PASS
  }
});

// 1. Create project from template
router.post('/api/projects/create', async (req, res) => {
  try {
    const { jobId, clientId, serviceType } = req.body;

    // Get template
    const templateResult = await pool.query(
      'SELECT * FROM project_templates WHERE service_type = $1',
      [serviceType]
    );
    const template = templateResult.rows[0];

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create project
    const projectResult = await pool.query(
      `INSERT INTO projects
       (job_id, client_id, name, service_type, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [jobId, clientId, template.name, serviceType, 'active']
    );

    const project = projectResult.rows[0];

    // Create tasks from template
    const taskIds = [];
    for (const taskTemplate of template.tasks || []) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (taskTemplate.days_until_due || 7));

      const taskResult = await pool.query(
        `INSERT INTO tasks
         (project_id, title, description, due_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [project.id, taskTemplate.title, taskTemplate.description, dueDate, 'pending']
      );

      taskIds.push(taskResult.rows[0].id);
    }

    res.json({ success: true, project, taskIds });
  } catch (error) {
    console.error('Project creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Auto-assign tasks
router.post('/api/tasks/:id/auto-assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { requiredSkills, territory } = req.body;

    // Get best available crew member
    const staffResult = await pool.query(
      `SELECT s.*, COUNT(ta.id) as assigned_count
       FROM staff s
       LEFT JOIN task_assignments ta ON s.id = ta.staff_id AND ta.status IN ('assigned', 'in_progress')
       WHERE s.skills @> $1 AND s.territory = $2 AND s.available = true
       GROUP BY s.id
       ORDER BY assigned_count ASC, s.experience_level DESC
       LIMIT 1`,
      [JSON.stringify(requiredSkills), territory]
    );

    if (staffResult.rows.length === 0) {
      return res.status(404).json({ error: 'No available staff found' });
    }

    const staff = staffResult.rows[0];

    // Assign task
    const result = await pool.query(
      `UPDATE tasks SET assigned_to = $1, status = $2 WHERE id = $3 RETURNING *`,
      [staff.id, 'assigned', id]
    );

    res.json({ success: true, task: result.rows[0], assignedTo: staff.id });
  } catch (error) {
    console.error('Assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Due-date reminder sequence
router.get('/api/tasks/reminders/check', async (req, res) => {
  try {
    const now = new Date();

    // 3-day reminder
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const threeResult = await pool.query(
      `SELECT t.*, s.email FROM tasks t
       JOIN staff s ON t.assigned_to = s.id
       WHERE DATE(t.due_date) = DATE($1)
       AND t.status IN ('assigned', 'in_progress')
       AND t.reminder_3d_sent = false`,
      [threeDays]
    );

    for (const task of threeResult.rows) {
      await mailer.sendMail({
        to: task.email,
        subject: `Task Due in 3 Days: ${task.title}`,
        html: `<p>Your task "${task.title}" is due in 3 days.</p>`
      });

      await pool.query(
        'UPDATE tasks SET reminder_3d_sent = true WHERE id = $1',
        [task.id]
      );
    }

    // 1-day reminder
    const oneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneResult = await pool.query(
      `SELECT t.*, s.email FROM tasks t
       JOIN staff s ON t.assigned_to = s.id
       WHERE DATE(t.due_date) = DATE($1)
       AND t.status IN ('assigned', 'in_progress')
       AND t.reminder_1d_sent = false`,
      [oneDay]
    );

    for (const task of oneResult.rows) {
      await mailer.sendMail({
        to: task.email,
        subject: `Task Due Tomorrow: ${task.title}`,
        html: `<p>Your task "${task.title}" is due tomorrow.</p>`
      });

      await pool.query(
        'UPDATE tasks SET reminder_1d_sent = true WHERE id = $1',
        [task.id]
      );
    }

    // Overdue
    const overdueResult = await pool.query(
      `SELECT t.*, s.email FROM tasks t
       JOIN staff s ON t.assigned_to = s.id
       WHERE DATE(t.due_date) < DATE(NOW())
       AND t.status IN ('assigned', 'in_progress')`,
      []
    );

    for (const task of overdueResult.rows) {
      await mailer.sendMail({
        to: task.email,
        subject: `OVERDUE: ${task.title}`,
        html: `<p>Your task "${task.title}" is now overdue.</p>`
      });
    }

    res.json({
      success: true,
      reminded3d: threeResult.rows.length,
      reminded1d: oneResult.rows.length,
      overdue: overdueResult.rows.length
    });
  } catch (error) {
    console.error('Reminder check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Dependency trigger
router.post('/api/tasks/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    // Mark task complete
    await pool.query(
      'UPDATE tasks SET status = $1, completed_at = NOW() WHERE id = $2',
      ['completed', id]
    );

    // Find dependent tasks
    const dependentsResult = await pool.query(
      `SELECT * FROM tasks WHERE depends_on = $1`,
      [id]
    );

    // Unlock dependent tasks
    for (const dependent of dependentsResult.rows) {
      await pool.query(
        'UPDATE tasks SET status = $1 WHERE id = $2',
        ['ready', dependent.id]
      );
    }

    res.json({
      success: true,
      unlockedTasks: dependentsResult.rows.length
    });
  } catch (error) {
    console.error('Dependency trigger error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Milestone notification
router.post('/api/projects/:id/notify-milestone', async (req, res) => {
  try {
    const { id } = req.params;

    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    const project = projectResult.rows[0];

    // Calculate progress
    const progressResult = await pool.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM tasks
       WHERE project_id = $1`,
      [id]
    );

    const progress = progressResult.rows[0];
    const percentComplete = Math.round((progress.completed / progress.total) * 100);

    // Get client
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [project.client_id]
    );
    const client = clientResult.rows[0];

    // Send notification
    await mailer.sendMail({
      to: client.email,
      subject: `Project Update: ${percentComplete}% Complete`,
      html: `
        <h2>${project.name}</h2>
        <p>Your project is ${percentComplete}% complete!</p>
        <p>${progress.completed} of ${progress.total} tasks completed.</p>
      `
    });

    res.json({ success: true, percentComplete });
  } catch (error) {
    console.error('Milestone notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Escalation alerts
router.get('/api/tasks/escalation/check', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, p.client_id, c.contact_email as manager_email
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       JOIN clients c ON p.client_id = c.id
       WHERE DATE(t.due_date) < DATE(NOW())
       AND t.status IN ('assigned', 'in_progress')`,
      []
    );

    const overdueTasks = result.rows;

    if (overdueTasks.length > 0) {
      // Get manager
      const manager = await pool.query(
        'SELECT email FROM users WHERE role = $1 LIMIT 1',
        ['manager']
      );

      if (manager.rows[0]) {
        await mailer.sendMail({
          to: manager.rows[0].email,
          subject: `ESCALATION: ${overdueTasks.length} Overdue Tasks`,
          html: `
            <h2>Overdue Tasks Alert</h2>
            <p>The following tasks need immediate attention:</p>
            <ul>${overdueTasks.map(t => `<li>${t.title} (due ${new Date(t.due_date).toDateString()})</li>`).join('')}</ul>
          `
        });
      }
    }

    res.json({ success: true, escalated: overdueTasks.length });
  } catch (error) {
    console.error('Escalation check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Time tracking
router.post('/api/time-tracking/start', async (req, res) => {
  try {
    const { taskId, staffId } = req.body;

    const result = await pool.query(
      `INSERT INTO time_entries
       (task_id, staff_id, start_time, status)
       VALUES ($1, $2, NOW(), $3)
       RETURNING *`,
      [taskId, staffId, 'active']
    );

    res.json({ success: true, timeEntry: result.rows[0] });
  } catch (error) {
    console.error('Time tracking start error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/time-tracking/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;

    const entryResult = await pool.query(
      'SELECT * FROM time_entries WHERE id = $1',
      [id]
    );
    const entry = entryResult.rows[0];

    const duration = (new Date() - new Date(entry.start_time)) / 1000 / 60; // minutes

    const result = await pool.query(
      `UPDATE time_entries
       SET end_time = NOW(), duration_minutes = $1, status = $2
       WHERE id = $3
       RETURNING *`,
      [duration, 'completed', id]
    );

    res.json({ success: true, timeEntry: result.rows[0], duration });
  } catch (error) {
    console.error('Time tracking stop error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Weekly status report
router.post('/api/projects/:id/weekly-report', async (req, res) => {
  try {
    const { id } = req.params;

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    const project = projectResult.rows[0];

    // Get metrics
    const metricsResult = await pool.query(
      `SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_this_week,
        COUNT(DISTINCT CASE WHEN completed_at >= $1 THEN id END) as completed_count,
        SUM(COALESCE(duration_minutes, 0)) as total_hours
       FROM tasks t
       LEFT JOIN time_entries te ON t.id = te.task_id
       WHERE t.project_id = $2`,
      [lastWeek, id]
    );

    const metrics = metricsResult.rows[0];

    // Get client
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [project.client_id]
    );
    const client = clientResult.rows[0];

    // Send report
    await mailer.sendMail({
      to: client.email,
      subject: `Weekly Project Report: ${project.name}`,
      html: `
        <h2>Weekly Status Report</h2>
        <p><strong>Project:</strong> ${project.name}</p>
        <p><strong>Tasks Completed This Week:</strong> ${metrics.completed_count}</p>
        <p><strong>Total Hours Logged:</strong> ${(metrics.total_hours / 60).toFixed(2)}</p>
        <p><strong>Overall Progress:</strong> ${metrics.completed_count}/${metrics.total_tasks} tasks</p>
      `
    });

    res.json({ success: true, metrics });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 9. Scope creep detection
router.post('/api/projects/:id/check-scope', async (req, res) => {
  try {
    const { id } = req.params;

    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    const project = projectResult.rows[0];

    // Get actual vs estimated
    const metricsResult = await pool.query(
      `SELECT
        COALESCE(SUM(duration_minutes), 0) as actual_hours,
        estimated_hours
       FROM tasks
       WHERE project_id = $1`,
      [id]
    );

    const metrics = metricsResult.rows[0];
    const actualHours = metrics.actual_hours / 60;
    const estimatedHours = metrics.estimated_hours || 0;
    const overagePercent = estimatedHours > 0 ? ((actualHours - estimatedHours) / estimatedHours) * 100 : 0;

    if (overagePercent > 20) {
      // Alert manager
      const manager = await pool.query(
        'SELECT email FROM users WHERE role = $1 LIMIT 1',
        ['manager']
      );

      if (manager.rows[0]) {
        await mailer.sendMail({
          to: manager.rows[0].email,
          subject: `SCOPE CREEP: ${project.name} (${overagePercent.toFixed(0)}% over)`,
          html: `<p>Project ${project.name} has exceeded estimated hours by ${overagePercent.toFixed(0)}%.</p><p>Estimated: ${estimatedHours}h | Actual: ${actualHours.toFixed(1)}h</p>`
        });
      }
    }

    res.json({
      success: true,
      estimatedHours,
      actualHours: actualHours.toFixed(1),
      overagePercent: overagePercent.toFixed(0),
      alert: overagePercent > 20
    });
  } catch (error) {
    console.error('Scope check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 10. Project completion trigger
router.post('/api/projects/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    const project = projectResult.rows[0];

    // Update project status
    await pool.query(
      'UPDATE projects SET status = $1, completed_at = NOW() WHERE id = $2',
      ['completed', id]
    );

    // Create invoice
    const invoiceResult = await pool.query(
      `INSERT INTO invoices
       (project_id, client_id, status, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [id, project.client_id, 'draft']
    );

    // Get client
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [project.client_id]
    );
    const client = clientResult.rows[0];

    // Request review
    await mailer.sendMail({
      to: client.email,
      subject: `Project Complete: ${project.name}`,
      html: `
        <h2>Project Completed!</h2>
        <p>Your project is now complete. Please review and let us know your feedback.</p>
        <p><a href="${process.env.APP_URL}/projects/${id}/review">Submit Review</a></p>
      `
    });

    res.json({ success: true, invoiceId: invoiceResult.rows[0].id });
  } catch (error) {
    console.error('Project completion error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
