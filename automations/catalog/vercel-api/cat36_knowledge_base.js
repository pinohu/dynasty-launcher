import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId, action = 'all' } = req.body;

    if (action === 'generate_articles' || action === 'all') {
      const tickets = await sql`
        SELECT id, title, description, resolution, created_at 
        FROM support_tickets 
        WHERE status = 'resolved' AND kb_article_created = false
        ORDER BY created_at DESC 
        LIMIT 50
      `;

      for (const ticket of tickets.rows) {
        try {
          const article = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'Create professional KB article with title, summary, steps, and tips'
              },
              {
                role: 'user',
                content: `Issue: ${ticket.title}\nDescription: ${ticket.description}\nResolution: ${ticket.resolution}`
              }
            ]
          });

          const articleContent = article.choices[0].message.content;

          await sql`
            INSERT INTO kb_articles 
            (title, content, source_ticket_id, created_at, status)
            VALUES (${ticket.title}, ${articleContent}, ${ticket.id}, NOW(), 'draft')
          `;

          await sql`
            UPDATE support_tickets 
            SET kb_article_created = true 
            WHERE id = ${ticket.id}
          `;
        } catch (e) {
          console.error(`KB generation error for ticket ${ticket.id}:`, e);
        }
      }
    }

    if (action === 'onboard_training' || action === 'all') {
      const newHires = employeeId ?
        (await sql`
          SELECT id, name, email, start_date 
          FROM employees WHERE id = ${employeeId}
        `).rows :
        (await sql`
          SELECT id, name, email, start_date 
          FROM employees 
          WHERE onboarding_status = 'pending' AND start_date <= NOW()
          ORDER BY start_date ASC 
          LIMIT 50
        `).rows;

      for (const employee of newHires) {
        const courses = await sql`
          SELECT id, course_name, duration_days, course_order 
          FROM training_courses 
          WHERE course_type = 'mandatory' 
          ORDER BY course_order ASC
        `;

        for (const course of courses.rows) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + course.duration_days);

          await sql`
            INSERT INTO training_enrollments 
            (employee_id, course_id, enrolled_at, due_date, status)
            VALUES (
              ${employee.id}, 
              ${course.id}, 
              NOW(), 
              ${dueDate.toISOString()}, 
              'pending'
            )
            ON CONFLICT DO NOTHING
          `;
        }

        await sql`
          UPDATE employees SET onboarding_status = 'in_progress' 
          WHERE id = ${employee.id}
        `;
      }
    }

    if (action === 'build_faq' || action === 'all') {
      const faqs = await sql`
        SELECT id, question, answer, times_asked 
        FROM support_faq 
        WHERE status = 'active'
        ORDER BY times_asked DESC 
        LIMIT 100
      `;

      const faqArray = faqs.rows.map(f => ({
        question: f.question,
        answer: f.answer,
        frequency: f.times_asked
      }));

      try {
        const organizer = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'Organize FAQs into logical sections and categories. Return JSON with sections.'
            },
            {
              role: 'user',
              content: `Organize these FAQs: ${JSON.stringify(faqArray)}`
            }
          ]
        });

        const sections = JSON.parse(organizer.choices[0].message.content);

        for (const section of sections.sections || []) {
          await sql`
            INSERT INTO faq_sections 
            (title, faqs, created_at, display_order)
            VALUES (
              ${section.title}, 
              ${JSON.stringify(section.items)}, 
              NOW(), 
              ${section.order || 0}
            )
            ON CONFLICT (title) DO UPDATE SET faqs = EXCLUDED.faqs
          `;
        }
      } catch (e) {
        console.error('FAQ organization error:', e);
      }
    }

    if (action === 'track_certifications' || action === 'all') {
      const certifications = await sql`
        SELECT ec.id, ec.employee_id, ec.certification_name, 
               ec.exam_date, ec.expiry_date, e.name, e.email
        FROM employee_certifications ec
        JOIN employees e ON ec.employee_id = e.id
        WHERE ec.exam_date IS NOT NULL
        ORDER BY ec.exam_date ASC
        LIMIT 100
      `;

      for (const cert of certifications.rows) {
        const existing = await sql`
          SELECT id FROM certification_records 
          WHERE employee_id = ${cert.employee_id}
          AND certification_name = ${cert.certification_name}
          AND recorded_date > NOW() - INTERVAL '24 hours'
        `;

        if (existing.rows.length === 0) {
          const expiryDate = cert.expiry_date ? new Date(cert.expiry_date) : null;
          const daysUntilExpiry = expiryDate ?
            Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24)) : null;

          await sql`
            INSERT INTO certification_records 
            (employee_id, certification_name, exam_date, expiry_date, 
             days_until_expiry, recorded_at)
            VALUES (
              ${cert.employee_id}, 
              ${cert.certification_name}, 
              ${cert.exam_date}, 
              ${cert.expiry_date}, 
              ${daysUntilExpiry},
              NOW()
            )
          `;

          if (daysUntilExpiry && daysUntilExpiry < 30 && daysUntilExpiry > 0) {
            console.log(`Certification expiring soon: ${cert.name} - ${cert.certification_name}`);
          }
        }
      }
    }

    if (action === 'wiki_maintenance' || action === 'all') {
      const stalePages = await sql`
        SELECT id, page_title, last_updated, owner_id 
        FROM internal_wiki_pages 
        WHERE last_updated < NOW() - INTERVAL '30 days'
        ORDER BY last_updated ASC 
        LIMIT 100
      `;

      for (const page of stalePages.rows) {
        const reminder = await sql`
          SELECT id FROM wiki_update_reminders 
          WHERE page_id = ${page.id}
          AND reminder_date > NOW() - INTERVAL '7 days'
        `;

        if (reminder.rows.length === 0) {
          const daysStale = Math.floor(
            (new Date() - new Date(page.last_updated)) / (1000 * 60 * 60 * 24)
          );

          await sql`
            INSERT INTO wiki_update_reminders 
            (page_id, owner_id, days_since_update, reminder_date)
            VALUES (${page.id}, ${page.owner_id}, ${daysStale}, NOW())
          `;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Knowledge base and training automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Knowledge base automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat36_knowledge_base'
    });
  }
}
