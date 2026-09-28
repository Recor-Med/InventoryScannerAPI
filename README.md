# Recor Scanner API

Backend API for the Recor Inventory Scanner app. Looks up Salesforce Account
records, consignment inventory items and product IDs, and submits scanned
stock counts back to Salesforce. Designed to be hosted on Azure App Service.

## Endpoints

These match what [app.js](../Recor%20Scanner/app.js) in the scanner frontend calls:

- `GET /api/account?number=<accountNumber>` → `{ id, name, warehouseCode }`
  - `404` if no account found
  - `422` if account found but missing `Name` or warehouse code field
- `GET /api/items?warehouseCode=<code>` → `{ items: [...] }`
- `GET /api/ids` → `{ ids: [...] }`
- `POST /api/submit` with JSON body `{ account, accountName, warehouseCode, date, codes: [...] }`

## Local setup

```bash
npm install
cp .env.example .env
# edit .env with your Salesforce integration user credentials
npm run dev
```

The API will run on `http://localhost:8080` by default.

## Salesforce connection

This uses [jsforce](https://jsforce.github.io/) with the **OAuth 2.0 JWT
Bearer flow** — authenticating via a Salesforce Connected App and a digital
certificate, rather than a username/password/security token. This avoids
password expiry/rotation issues entirely and works regardless of the
calling server's IP address, which makes it well suited to an API-only
Integration User that can't log into the Salesforce UI to self-service a
security token.

### One-time setup: generate a certificate

```bash
openssl genrsa -out server.key 2048
openssl req -new -x509 -key server.key -out server.crt -days 3650 -subj "/CN=RecorScannerAPI"
```

This creates:
- `server.key` — the **private key**. Keep this secret; never commit it to
  git (already covered by [.gitignore](.gitignore)). This is what the API
  uses to sign JWTs.
- `server.crt` — the **public certificate**. This gets uploaded to the
  Salesforce Connected App (not secret, safe to share with your Salesforce
  admin).

### One-time setup: create the Connected App in Salesforce

Ask your Salesforce admin to:

1. **Setup → App Manager → New Connected App**.
2. Fill in Connected App Name (e.g. "Recor Scanner API"), API name, and a
   contact email.
3. Under **API (Enable OAuth Settings)**:
   - Check **Enable OAuth Settings**.
   - Callback URL: any placeholder is fine for JWT flow, e.g.
     `https://login.salesforce.com/services/oauth2/success` (not actually
     used for this flow, but required to be filled in).
   - Check **Use digital signatures** → upload the `server.crt` file
     generated above.
   - Selected OAuth Scopes: add **Manage user data via APIs (api)** at
     minimum (add **Perform requests at any time (refresh_token, offline_access)**
     if you want longer-lived tokens, though not required for this flow).
4. Save. Note the **Consumer Key** shown on the resulting page — this is
   your `SF_CLIENT_ID`. (Salesforce can take ~10 minutes to fully activate a
   new Connected App.)
5. Under **Manage → Edit Policies** (on the Connected App detail page):
   - Set **Permitted Users** to **Admin approved users are pre-authorized**.
6. Under **Manage → Manage Profiles/Permission Sets**, add the Integration
   User's profile or a permission set assigned to it, so it's pre-authorized
   to use this Connected App without an interactive OAuth consent screen
   (which the Integration User can't complete anyway, since it can't log
   into the UI).

### Required environment variables (see [.env.example](.env.example))

- `SF_LOGIN_URL` — `https://login.salesforce.com` for production orgs, or
  `https://test.salesforce.com` for sandboxes (or your org's specific My
  Domain URL if generic login is disabled for your org).
- `SF_USERNAME` — the Integration User's username (e.g. ending in `.full`
  for a sandbox).
- `SF_CLIENT_ID` — the Connected App's Consumer Key.
- `SF_JWT_PRIVATE_KEY` — the full contents of `server.key`. When set as a
  single-line environment variable (e.g. in Azure App Settings or Key
  Vault), replace actual newlines with literal `\n` — the code handles
  converting these back automatically.
- `SF_JWT_PRIVATE_KEY_PATH` — alternative to the above: a file path to
  `server.key` if you'd rather mount/deploy the key as a file instead of an
  environment variable.
- `SF_ACCOUNT_OBJECT`, `SF_ACCOUNT_NUMBER_FIELD`, `SF_WAREHOUSE_CODE_FIELD` —
  object/field API names for account lookups. Defaults assume standard
  `Account.AccountNumber` plus a custom `cr5bd_warehousecode__c` field.
- `SF_ITEM_OBJECT` / `SF_ID_OBJECT` — custom object API names for inventory
  items and the product ID lookup table.
- `SF_SUBMIT_FLOW_API_NAME` — optional. If set, `/api/submit` invokes this
  Salesforce Flow (via the REST "Invocable Actions" API) with the submitted
  payload. If left blank, submissions are just logged so you can wire the
  Flow up later without breaking the frontend.

> ⚠️ For production, consider switching to the OAuth 2.0 JWT Bearer flow with
> a Connected App + certificate instead of username/password, since it
> doesn't require rotating a security token and works better with MFA. Ask if
> you'd like this set up instead.

## Deploying to Azure

A GitHub Actions workflow is included at
[.github/workflows/azure-webapp-deploy.yml](.github/workflows/azure-webapp-deploy.yml)
which deploys this app to an Azure App Service (Linux, Node.js) instance on
every push to `main`.

Steps:

1. Create an Azure App Service (Node 18 or later, Linux plan) — e.g. via the
   Azure Portal or `az webapp create`.
2. In the Azure Portal, go to the App Service → **Deployment Center** →
   **Download publish profile**, or generate one via:
   ```bash
   az webapp deployment list-publishing-profiles \
     --name <your-app-name> --resource-group <your-rg> --xml
   ```
3. In this GitHub repo, add a secret named `AZURE_WEBAPP_PUBLISH_PROFILE`
   containing that XML.
4. Update `AZURE_WEBAPP_NAME` in the workflow file to match your App Service
   name.
5. In the App Service → **Configuration** → **Application settings**, add all
   the environment variables from `.env.example` (`SF_USERNAME`,
   `SF_PASSWORD`, `SF_SECURITY_TOKEN`, `ALLOWED_ORIGINS`, etc.) — these are
   not committed to the repo for security.
6. Push to `main` and the workflow will build and deploy automatically.

After deploying, update the scanner app's `fetch` URLs in
[app.js](../Recor%20Scanner/app.js) to point at your new App Service URL.
