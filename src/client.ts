/**
 * OData HTTP client for Prospect365 CRM API.
 * Handles authentication, rate limiting, and error formatting.
 */

export interface ODataResponse<T> {
  value: T[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

export interface ODataError {
  error: {
    code: string;
    message: string;
    details?: Array<{ code: string; message: string; target?: string }>;
  };
}

export class ProspectClient {
  private baseUrl: string;
  private token: string;
  private profileId: string;
  private locale: string;
  private apiUserEmail: string | null = null;
  private apiUserEmailError: Error | null = null;
  private apiUserEmailPromise: Promise<string> | null = null;
  private retryDelayMs = 1000;
  private maxRetries = 3;

  constructor() {
    // Regional write-capable endpoint. The public-docs host
    // crm-odata-v1.prospect365.com is a read-only / no-op shim — bound
    // actions like SendMessage silently return value:0 there. Confirmed
    // via UI HAR capture 2026-04-23.
    this.baseUrl = process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
    this.token = process.env.PROSPECT_PAT || "";
    this.profileId = process.env.PROSPECT_PROFILE_ID || "";
    this.locale = process.env.PROSPECT_LOCALE || "en-GB";

    if (!this.token) {
      throw new Error(
        "PROSPECT_PAT environment variable is required. " +
        "Generate a Personal Access Token in Prospect CRM: Settings > Integrations > API."
      );
    }

  }

  /**
   * Ensure this.profileId is populated. If not set via env var, resolve it by
   * calling GET /Info() — which returns { ProfileId, UserId, ... } keyed off
   * the PAT's tenant. Runs at most once per process.
   */
  private async ensureProfileId(): Promise<void> {
    if (this.profileId) return;
    try {
      const res = await fetch(`${this.baseUrl}/Info()`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const info = (await res.json()) as { ProfileId?: string };
        if (info.ProfileId) {
          this.profileId = String(info.ProfileId);
        }
      }
    } catch {
      // best-effort — if /Info() is unreachable, caller will see the eventual value:0
    }
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-locale": this.locale,
    };
    if (this.profileId) h["x-profile-id"] = this.profileId;
    return h;
  }

  /**
   * Execute a GET request against the OData API.
   */
  async get<T>(entitySet: string, queryParams?: string): Promise<ODataResponse<T>> {
    const url = queryParams
      ? `${this.baseUrl}/${entitySet}?${queryParams}`
      : `${this.baseUrl}/${entitySet}`;

    return this.fetchWithRetry<ODataResponse<T>>(url, { method: "GET" });
  }

  /**
   * GET a single entity by key.
   * Prospect OData wraps even single-entity responses in { value: [...] },
   * so we unwrap automatically.
   */
  async getById<T>(entitySet: string, id: number | string, queryParams?: string): Promise<T> {
    const url = queryParams
      ? `${this.baseUrl}/${entitySet}(${id})?${queryParams}`
      : `${this.baseUrl}/${entitySet}(${id})`;

    const result = await this.fetchWithRetry<T | { value: T[] }>(url, { method: "GET" });

    // Prospect OData returns { value: [...] } even for single-entity GETs
    if (result && typeof result === "object" && "value" in result && Array.isArray((result as { value: T[] }).value)) {
      const arr = (result as { value: T[] }).value;
      if (arr.length === 0) {
        throw new Error(`${entitySet}(${id}) not found — the API returned an empty result set.`);
      }
      return arr[0];
    }

    return result as T;
  }

  /**
   * POST to create a new entity.
   */
  async post<T>(entitySet: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${entitySet}`;
    return this.fetchWithRetry<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH to update an existing entity.
   */
  async patch<T>(entitySet: string, id: number | string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/${entitySet}(${id})`;
    return this.fetchWithRetry<T>(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE an entity.
   */
  async delete(entitySet: string, id: number | string): Promise<void> {
    const url = `${this.baseUrl}/${entitySet}(${id})`;
    await this.fetchWithRetry<void>(url, { method: "DELETE" });
  }

  /**
   * GET a URL path and return raw bytes + content-type. Used for bound functions
   * like /Documents(id)/Raw() that stream a file back rather than JSON.
   */
  async getBinary(pathAfterBase: string): Promise<{ bytes: Buffer; contentType: string }> {
    await this.ensureProfileId();
    const url = `${this.baseUrl}/${pathAfterBase}`;
    const res = await fetch(url, { method: "GET", headers: this.headers });
    if (!res.ok) {
      throw new Error(
        `Prospect API error: HTTP ${res.status} ${res.statusText}\nURL: ${url}\nResponse: ${await res.text()}`,
      );
    }
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType };
  }

  /**
   * Invoke a bound OData action on a single entity — POST /{entitySet}({id})/{actionName}().
   * Bare form (no namespace prefix) per the form Prospect's own UI uses. The "Default."
   * alias documented in Swagger is a no-op on the regional host.
   *
   * Used for MergeData / SendMessage / Confirm / Copy / Recalculate etc.
   * Prospect wraps scalar return values in { "@odata.context": ..., "value": <scalar> }.
   */
  async invokeAction<T>(
    entitySet: string,
    id: number | string,
    actionName: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/${entitySet}(${id})/${actionName}()`;
    return this.fetchWithRetry<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Invoke an unbound or collection-bound action — POST /{entitySet}/{actionName}.
   * Used for e.g. /DocumentAttachments/AttachExistingDocument. Note: no trailing
   * parens in the URL, matching the form the Prospect UI uses for these.
   */
  async invokeCollectionAction<T>(
    entitySet: string,
    actionName: string,
    body: Record<string, unknown> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}/${entitySet}/${actionName}`;
    return this.fetchWithRetry<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetch with automatic retry on 429 (rate limit).
   */
  private async fetchWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    // Lazy resolve profileId from /Info() on first real request
    await this.ensureProfileId();

    const response = await fetch(url, {
      ...init,
      headers: this.headers,
    });

    // Rate limited — retry with backoff
    if (response.status === 429 && attempt < this.maxRetries) {
      const delay = this.retryDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      return this.fetchWithRetry<T>(url, init, attempt + 1);
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Parse response
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      if (!response.ok) {
        throw new Error(
          `Prospect API error: HTTP ${response.status} ${response.statusText}\n` +
          `URL: ${url}\n` +
          `Response: ${await response.text()}`
        );
      }
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const odataError = data as ODataError;
      const msg = odataError?.error?.message || JSON.stringify(data);
      const details = odataError?.error?.details
        ?.map((d) => `  - ${d.target || ""}: ${d.message}`)
        .join("\n");

      throw new Error(
        `Prospect API error: HTTP ${response.status}\n` +
        `Message: ${msg}\n` +
        (details ? `Details:\n${details}\n` : "") +
        `URL: ${url}`
      );
    }

    return data as T;
  }

  /**
   * Resolve the email address of the API user this server authenticates as.
   * Cached per process. Used by the safety gate in send_quote_email so
   * customer email is impossible from this MCP. Throws (and caches the
   * error) if PROSPECT_USER_ID is unset, the lookup fails, or the user
   * has no email on file. Callers that want to refuse-on-failure should
   * surface the error verbatim — no silent fallback.
   */
  async getApiUserEmail(): Promise<string> {
    if (this.apiUserEmail) return this.apiUserEmail;
    if (this.apiUserEmailError) throw this.apiUserEmailError;
    if (this.apiUserEmailPromise) return this.apiUserEmailPromise;

    this.apiUserEmailPromise = (async () => {
      const userId = (process.env.PROSPECT_USER_ID || "").trim();
      if (!userId) {
        throw new Error(
          "PROSPECT_USER_ID env var is not set — cannot resolve the API user's email " +
            "for the send_quote_email safety gate. Set PROSPECT_USER_ID to the CRM UserCode " +
            "the PAT belongs to (e.g. 'DL').",
        );
      }
      const res = await this.get<{ UserCode: string; EmailAddress: string | null }>(
        "Users",
        `$filter=UserCode eq '${userId.replace(/'/g, "''")}'&$select=UserCode,EmailAddress&$top=1`,
      );
      const row = res.value[0];
      if (!row) {
        throw new Error(
          `No CRM user found with UserCode '${userId}' — cannot resolve API user email for safety gate.`,
        );
      }
      const email = (row.EmailAddress || "").trim();
      if (!email) {
        throw new Error(
          `CRM user '${userId}' has no EmailAddress on file — cannot resolve API user email for safety gate.`,
        );
      }
      this.apiUserEmail = email;
      return email;
    })().catch((err) => {
      this.apiUserEmailError = err instanceof Error ? err : new Error(String(err));
      this.apiUserEmailPromise = null;
      throw this.apiUserEmailError;
    });
    return this.apiUserEmailPromise;
  }
}

/** Singleton client instance */
let _client: ProspectClient | null = null;

export function getClient(): ProspectClient {
  if (!_client) {
    _client = new ProspectClient();
  }
  return _client;
}
