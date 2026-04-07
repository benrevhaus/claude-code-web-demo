import { google } from "googleapis";
import { config } from "../config.js";

async function main() {
  const auth = new google.auth.JWT({
    email: config.GA4_CLIENT_EMAIL,
    key: config.GA4_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  const client = google.analyticsdata({ version: "v1beta", auth });
  const metadata = await client.properties.getMetadata({
    name: `properties/${config.GA4_PROPERTY_ID}/metadata`,
  });

  const customDims = metadata.data.dimensions?.filter((d) => d.apiName?.startsWith("customEvent:")) ?? [];
  console.log(`Found ${customDims.length} custom event dimensions:\n`);
  for (const d of customDims) {
    console.log(`  ${d.apiName}  —  ${d.uiName}`);
  }
}

main().catch(console.error);
