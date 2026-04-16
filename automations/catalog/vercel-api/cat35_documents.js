import { sql } from '@vercel/postgres';
import { OpenAI } from 'openai';
import { Storage } from '@google-cloud/storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GCP_KEY_FILE
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { documentId, action = 'all' } = req.body;

    if (action === 'classify' || action === 'all') {
      const docs = documentId ?
        (await sql`SELECT id, file_name, file_url FROM documents WHERE id = ${documentId}`).rows :
        (await sql`
          SELECT id, file_name, file_url FROM documents 
          WHERE classification IS NULL AND status = 'uploaded'
          ORDER BY upload_date DESC LIMIT 50
        `).rows;

      for (const doc of docs) {
        try {
          const classification = await openai.chat.completions.create({
            model: 'gpt-4-vision',
            messages: [
              {
                role: 'system',
                content: 'Classify document: contract, invoice, receipt, license, certificate, insurance, compliance, compliance_report, other'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Classify: ${doc.file_name}`
                  },
                  ...(doc.file_url ? [{
                    type: 'image_url',
                    image_url: { url: doc.file_url }
                  }] : [])
                ]
              }
            ]
          });

          const classResult = classification.choices[0].message.content.toLowerCase();
          const docType = classResult.split('\n')[0];

          await sql`
            UPDATE documents 
            SET classification = ${docType}, classified_at = NOW()
            WHERE id = ${doc.id}
          `;

          await sql`
            INSERT INTO document_history 
            (document_id, action, action_date)
            VALUES (${doc.id}, 'classified_as_' || ${docType}, NOW())
          `;
        } catch (e) {
          console.error(`Classification error for ${doc.id}:`, e);
        }
      }
    }

    if (action === 'version_control' || action === 'all') {
      const docs = documentId ?
        (await sql`SELECT id FROM documents WHERE id = ${documentId}`).rows :
        (await sql`SELECT id FROM documents WHERE status = 'active' LIMIT 100`).rows;

      for (const doc of docs) {
        const versions = await sql`
          SELECT id, version_number, created_at 
          FROM document_versions 
          WHERE document_id = ${doc.id}
          ORDER BY version_number DESC
        `;

        for (const version of versions.rows) {
          await sql`
            INSERT INTO document_history 
            (document_id, version_id, action, action_date)
            VALUES (${doc.id}, ${version.id}, 'version_tracked', ${version.created_at})
            ON CONFLICT DO NOTHING
          `;
        }
      }
    }

    if (action === 'bulk_generator' || action === 'all') {
      const templates = await sql`
        SELECT id, template_name, template_fields 
        FROM mail_merge_templates 
        WHERE status = 'active'
        LIMIT 10
      `;

      for (const template of templates.rows) {
        const recipients = await sql`
          SELECT c.id, c.email, c.name, c.address
          FROM clients c
          WHERE c.status = 'active' 
          LIMIT 100
        `;

        for (const recipient of recipients.rows) {
          const docName = `${template.template_name}_${recipient.id}_${Date.now()}`;

          const mergedData = {
            name: recipient.name,
            email: recipient.email,
            address: recipient.address,
            date: new Date().toLocaleDateString()
          };

          await sql`
            INSERT INTO generated_documents 
            (template_id, recipient_id, generated_at, document_name)
            VALUES (${template.id}, ${recipient.id}, NOW(), ${docName})
          `;
        }
      }
    }

    if (action === 'expiry_monitor' || action === 'all') {
      const expiringDocs = await sql`
        SELECT id, document_name, expiry_date 
        FROM tracked_documents 
        WHERE expiry_date IS NOT NULL
        AND expiry_date <= NOW() + INTERVAL '30 days'
        AND expiry_date > NOW()
        ORDER BY expiry_date ASC
        LIMIT 100
      `;

      for (const doc of expiringDocs.rows) {
        const daysUntil = Math.ceil(
          (new Date(doc.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)
        );

        const existingAlert = await sql`
          SELECT id FROM expiry_alerts 
          WHERE tracked_document_id = ${doc.id}
          AND alert_date > NOW() - INTERVAL '24 hours'
        `;

        if (existingAlert.rows.length === 0) {
          const severity = daysUntil < 7 ? 'urgent' : daysUntil < 14 ? 'warning' : 'notice';

          await sql`
            INSERT INTO expiry_alerts 
            (tracked_document_id, days_until_expiry, severity, alert_date)
            VALUES (${doc.id}, ${daysUntil}, ${severity}, NOW())
          `;
        }
      }
    }

    if (action === 'ocr_scan' || action === 'all') {
      const scanDocs = await sql`
        SELECT id, file_url, document_type 
        FROM paper_documents 
        WHERE ocr_processed = false
        AND document_type IN ('receipt', 'form', 'invoice', 'contract')
        LIMIT 50
      `;

      for (const doc of scanDocs.rows) {
        try {
          const extraction = await openai.chat.completions.create({
            model: 'gpt-4-vision',
            messages: [
              {
                role: 'system',
                content: 'Extract all text and structured data from document image. Return JSON.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract text and data:'
                  },
                  ...(doc.file_url ? [{
                    type: 'image_url',
                    image_url: { url: doc.file_url }
                  }] : [])
                ]
              }
            ]
          });

          const extractedText = extraction.choices[0].message.content;

          await sql`
            UPDATE paper_documents 
            SET 
              ocr_processed = true,
              extracted_text = ${extractedText},
              extraction_date = NOW()
            WHERE id = ${doc.id}
          `;

          if (doc.document_type === 'invoice') {
            const invoiceData = JSON.parse(extractedText);
            await sql`
              INSERT INTO vendor_invoices 
              (vendor_id, amount, description, received_date, extracted_data)
              VALUES (NULL, ${invoiceData.amount || 0}, ${invoiceData.description}, NOW(), ${extractedText})
            `;
          }
        } catch (e) {
          console.error(`OCR error for ${doc.id}:`, e);
          await sql`
            UPDATE paper_documents 
            SET ocr_processed = true, extraction_error = ${e.message}
            WHERE id = ${doc.id}
          `;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Document management automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Document management error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat35_documents'
    });
  }
}
