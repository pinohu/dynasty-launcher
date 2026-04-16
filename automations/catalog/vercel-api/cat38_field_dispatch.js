import { sql } from '@vercel/postgres';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, technicianId, action = 'all' } = req.body;

    if (action === 'auto_dispatch' || action === 'all') {
      const pendingJobs = jobId ?
        (await sql`SELECT id, client_id, service_type, priority, client_latitude, client_longitude 
          FROM jobs WHERE id = ${jobId}`).rows :
        (await sql`
          SELECT id, client_id, service_type, priority, client_latitude, client_longitude
          FROM jobs 
          WHERE status = 'pending' AND assigned_technician_id IS NULL
          ORDER BY priority DESC, created_at ASC 
          LIMIT 50
        `).rows;

      for (const job of pendingJobs) {
        const availableTechs = await sql`
          SELECT id, name, latitude, longitude, active_jobs, skills
          FROM technicians 
          WHERE status = 'active' AND available = true
          ORDER BY active_jobs ASC
          LIMIT 10
        `;

        let nearestTech = null;
        let minDistance = Infinity;

        for (const tech of availableTechs.rows) {
          try {
            const distanceResponse = await fetch(
              `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${tech.latitude},${tech.longitude}&destinations=${job.client_latitude},${job.client_longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
            );
            const distanceData = await distanceResponse.json();

            if (distanceData.rows && distanceData.rows[0].elements) {
              const distanceInMeters = distanceData.rows[0].elements[0].distance.value;
              
              if (distanceInMeters < minDistance) {
                minDistance = distanceInMeters;
                nearestTech = tech;
              }
            }
          } catch (e) {
            console.error(`Distance calculation error for tech ${tech.id}:`, e);
          }
        }

        if (nearestTech) {
          await sql`
            UPDATE jobs 
            SET assigned_technician_id = ${nearestTech.id}, 
                assigned_at = NOW(), 
                status = 'assigned',
                estimated_distance = ${minDistance}
            WHERE id = ${job.id}
          `;

          await sql`
            UPDATE technicians SET active_jobs = active_jobs + 1 
            WHERE id = ${nearestTech.id}
          `;
        }
      }
    }

    if (action === 'response_tracking' || action === 'all') {
      const activeJobs = jobId ?
        (await sql`
          SELECT j.id, j.assigned_at, j.start_time, j.technician_id
          FROM jobs j WHERE j.id = ${jobId}
        `).rows :
        (await sql`
          SELECT j.id, j.assigned_at, j.start_time, j.technician_id
          FROM jobs j 
          WHERE j.status IN ('assigned', 'in_progress') AND j.assigned_at IS NOT NULL
          ORDER BY j.assigned_at DESC 
          LIMIT 100
        `).rows;

      for (const job of activeJobs) {
        const startTime = job.start_time ? new Date(job.start_time) : null;
        const assignedTime = new Date(job.assigned_at);
        const responseMinutes = startTime ? 
          Math.floor((startTime - assignedTime) / (1000 * 60)) :
          Math.floor((new Date() - assignedTime) / (1000 * 60));

        await sql`
          INSERT INTO response_time_logs 
          (job_id, technician_id, assigned_at, response_minutes, status)
          VALUES (${job.id}, ${job.technician_id}, ${job.assigned_at}, ${responseMinutes}, 'recorded')
          ON CONFLICT (job_id, DATE(assigned_at)) DO NOTHING
        `;

        if (responseMinutes > 120) {
          console.log(`Delayed response for job ${job.id}: ${responseMinutes} minutes`);
        }
      }
    }

    if (action === 'job_documentation' || action === 'all') {
      const inProgressJobs = jobId ?
        (await sql`
          SELECT j.id, j.technician_id, t.email, j.service_type 
          FROM jobs j 
          JOIN technicians t ON j.technician_id = t.id
          WHERE j.id = ${jobId}
        `).rows :
        (await sql`
          SELECT j.id, j.technician_id, t.email, j.service_type 
          FROM jobs j 
          JOIN technicians t ON j.technician_id = t.id
          WHERE j.status = 'in_progress' 
          AND (j.completion_photos IS NULL OR j.customer_signature IS NULL)
          LIMIT 50
        `).rows;

      for (const job of inProgressJobs) {
        const existing = await sql`
          SELECT id FROM documentation_requests 
          WHERE job_id = ${job.id}
          AND created_at > NOW() - INTERVAL '24 hours'
        `;

        if (existing.rows.length === 0) {
          await sql`
            INSERT INTO documentation_requests 
            (job_id, technician_id, request_type, created_at)
            VALUES (${job.id}, ${job.technician_id}, 'photos_checklist_signature', NOW())
          `;

          console.log(`Documentation request sent for job ${job.id}`);
        }
      }
    }

    if (action === 'location_tracking' || action === 'all') {
      const techs = technicianId ?
        (await sql`SELECT id FROM technicians WHERE id = ${technicianId}`).rows :
        (await sql`
          SELECT t.id FROM technicians t 
          WHERE t.status = 'active' 
          LIMIT 100
        `).rows;

      for (const tech of techs) {
        const locations = await sql`
          SELECT id, current_latitude, current_longitude, updated_at
          FROM technician_locations
          WHERE technician_id = ${tech.id}
          ORDER BY updated_at DESC LIMIT 10
        `;

        for (const loc of locations.rows) {
          await sql`
            INSERT INTO location_history 
            (technician_id, latitude, longitude, recorded_at, accuracy)
            VALUES (${tech.id}, ${loc.current_latitude}, ${loc.current_longitude}, 
                    ${loc.updated_at}, 10)
            ON CONFLICT DO NOTHING
          `;
        }
      }

      const activeJobs = await sql`
        SELECT j.id, j.technician_id, j.client_latitude, j.client_longitude, t.latitude, t.longitude
        FROM jobs j
        JOIN technicians t ON j.technician_id = t.id
        WHERE j.status IN ('assigned', 'in_progress')
        LIMIT 100
      `;

      for (const job of activeJobs.rows) {
        const distance = Math.sqrt(
          Math.pow(job.client_latitude - job.latitude, 2) + 
          Math.pow(job.client_longitude - job.longitude, 2)
        ) * 111; // rough km conversion

        await sql`
          INSERT INTO job_distance_tracking 
          (job_id, distance_km, tracked_at)
          VALUES (${job.id}, ${distance}, NOW())
        `;
      }
    }

    if (action === 'parts_request' || action === 'all') {
      const pendingRequests = await sql`
        SELECT jpr.id, jpr.job_id, jpr.item_id, jpr.quantity_needed, 
               jpr.requested_at, ii.current_stock
        FROM job_parts_requests jpr
        JOIN inventory_items ii ON jpr.item_id = ii.id
        WHERE jpr.status = 'pending'
        AND ii.current_stock >= jpr.quantity_needed
        ORDER BY jpr.requested_at ASC 
        LIMIT 100
      `;

      for (const request of pendingRequests) {
        await sql`
          UPDATE inventory_items 
          SET current_stock = current_stock - ${request.quantity_needed}
          WHERE id = ${request.item_id}
        `;

        await sql`
          UPDATE job_parts_requests 
          SET status = 'fulfilled', fulfilled_at = NOW()
          WHERE id = ${request.id}
        `;

        await sql`
          INSERT INTO parts_fulfillment_log 
          (request_id, item_id, quantity, fulfilled_date)
          VALUES (${request.id}, ${request.item_id}, ${request.quantity_needed}, NOW())
        `;
      }

      const unfulfilledRequests = await sql`
        SELECT id, item_id, quantity_needed FROM job_parts_requests 
        WHERE status = 'pending' 
        AND requested_at < NOW() - INTERVAL '1 hour'
        LIMIT 100
      `;

      for (const request of unfulfilledRequests) {
        await sql`
          UPDATE job_parts_requests 
          SET status = 'backorder', last_status_check = NOW()
          WHERE id = ${request.id}
        `;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Field service and dispatch automations executed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Field dispatch automation error:', error);
    res.status(500).json({ 
      error: error.message,
      context: 'cat38_field_dispatch'
    });
  }
}
