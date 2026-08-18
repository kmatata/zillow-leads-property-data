"""Call the Zillow Leads & Property Data actor from Python and print a
summary of what came back.

Install:  pip install apify-client
Auth:     export APIFY_TOKEN=your_token   (from https://console.apify.com/account/integrations)
Run:      python python_quickstart.py
"""

import os

from apify_client import ApifyClient

ACTOR_ID = "germane_binoculars/zillow-leads-property-data"


def main():
    token = os.environ.get("APIFY_TOKEN")
    if not token:
        raise SystemExit("Set APIFY_TOKEN first — see https://console.apify.com/account/integrations")

    client = ApifyClient(token)

    # catalog mode: an instant, already-enriched snapshot, no bounding box,
    # no wait. Good first call to confirm your token/setup work end to end.
    run_input = {"mode": "catalog", "metro": "Chicago"}

    print(f"Starting a catalog run for Chicago...")
    run = client.actor(ACTOR_ID).call(run_input=run_input)

    dataset_id = run["defaultDatasetId"]
    items = list(client.dataset(dataset_id).iterate_items())

    print(f"Run {run['id']} finished with status {run['status']}")
    print(f"Got {len(items)} rows")
    if items:
        sample = items[0]
        print("\nFirst row (a subset of fields):")
        for key in ("address_street", "address_city", "price", "agent_name", "agent_phone"):
            print(f"  {key}: {sample.get(key)}")

    # For a live-collection order (custom_search / recent_activity), the run
    # can take real wall-clock time — see the actor's README, "Long-running
    # orders: fire, poll, fetch" for the recommended fire/poll/fetch pattern
    # when calling from an agent or a script that shouldn't block.


if __name__ == "__main__":
    main()
