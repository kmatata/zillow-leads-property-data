// Call the Zillow Leads & Property Data actor from Node and print a summary
// of what came back.
//
// Install:  npm install apify-client
// Auth:     export APIFY_TOKEN=your_token   (from https://console.apify.com/account/integrations)
// Run:      node node_quickstart.js

const { ApifyClient } = require('apify-client');

const ACTOR_ID = 'germane_binoculars/zillow-leads-property-data';

async function main() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error('Set APIFY_TOKEN first — see https://console.apify.com/account/integrations');
  }

  const client = new ApifyClient({ token });

  // catalog mode: an instant, already-enriched snapshot, no bounding box,
  // no wait. Good first call to confirm your token/setup work end to end.
  const runInput = { mode: 'catalog', metro: 'Chicago' };

  console.log('Starting a catalog run for Chicago...');
  const run = await client.actor(ACTOR_ID).call(runInput);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  console.log(`Run ${run.id} finished with status ${run.status}`);
  console.log(`Got ${items.length} rows`);
  if (items.length) {
    const sample = items[0];
    console.log('\nFirst row (a subset of fields):');
    for (const key of ['address_street', 'address_city', 'price', 'agent_name', 'agent_phone']) {
      console.log(`  ${key}: ${sample[key]}`);
    }
  }

  // For a live-collection order (custom_search / recent_activity), the run
  // can take real wall-clock time — see the actor's README, "Long-running
  // orders: fire, poll, fetch" for the recommended fire/poll/fetch pattern
  // when calling from an agent or a script that shouldn't block.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
