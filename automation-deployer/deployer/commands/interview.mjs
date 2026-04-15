/**
 * `automation-deployer interview --tenant <slug>` — runs the needs assessment.
 */
import { runInterview } from '../lib/interview.mjs';

export default async function ({ args, root }) {
  const slug = args.tenant;
  if (!slug) {
    console.error('--tenant <slug> is required');
    return 1;
  }
  const options = {};
  if (args.max) options.max = Number(args.max);
  if (args.answers) options.answers = JSON.parse(args.answers);

  const { picks, runningCost } = await runInterview(root, slug, options);
  console.log(`\nSelected ${picks.length} automations for ${slug} (est. $${runningCost.toFixed(2)}/mo)`);
  console.log('Top 10:');
  for (const p of picks.slice(0, 10)) {
    console.log(`  ${p.id}  ${p.title}  (${p.rationale})`);
  }
  console.log(`\nReview tenants/${slug}/selected-automations.yaml`);
  console.log('Next: automation-deployer plan --tenant ' + slug);
  return 0;
}
