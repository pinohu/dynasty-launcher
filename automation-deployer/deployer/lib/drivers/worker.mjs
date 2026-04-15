/**
 * Worker driver — registers a T5 out-of-band worker (deployer-hosted scraper
 * or public-record poller) with the deployer's scheduler.
 *
 * The scheduler lives at `api/worker-scheduler.js` (Vercel cron) or as a
 * separate Railway/Fly worker. This driver only registers metadata; the
 * actual worker runtime is not part of this stub.
 */
export default {
  name: 'worker',

  async provision({ tenant, manifest, context }) {
    const schedule = manifest.triggers.find((t) => t.type === 'cron')?.expression ?? '0 * * * *';
    return {
      ok: true,
      resources: {
        worker_id: `worker-${tenant.slug}-${manifest.id}`,
        schedule,
        target_endpoint: `${tenant.infra?.domain ? `https://${tenant.infra.domain}/api/ingest` : '<tenant endpoint>'}`,
      },
      simulated: true,
      notes: ['Worker registration is metadata-only in this stub; plug into scheduler infra to activate.'],
    };
  },

  async verify({ manifest, deployed }) {
    return { ok: true, signals: { registered: !!deployed?.worker_id } };
  },

  async rollback({ deployed }) {
    return { ok: true, notes: [`Deregistered ${deployed?.worker_id ?? '(unknown)'}`], simulated: true };
  },
};
