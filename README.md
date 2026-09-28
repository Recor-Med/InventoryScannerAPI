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

This uses [jsforce](https://jsforce.github.io/) with the integration user's
username + password + security token (the "SOAP login" flow). This is the
simplest option since you already have a dedicated integration user.

Required environment variables (see [.env.example](.env.example)):

- `SF_LOGIN_URL` — `https://login.salesforce.com` for production orgs, or
  `https://test.salesforce.com` for sandboxes.
- `SF_USERNAME` / `SF_PASSWORD` / `SF_SECURITY_TOKEN` — the integration
  user's credentials. Reset the security token from Salesforce Setup →
  My Personal Information → Reset My Security Token, if you don't have it.
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
