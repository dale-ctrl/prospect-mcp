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
  private retryDelayMs = 1000;
  private maxRetries = 3;

  constructor() {
    // Regional write-capable endpoint. The public-docs host
    // crm-odata-v1.prospect365.com is a read-only / no-op shim — bound
    // actions silently return value:0 there.
    this.baseUrl = process.env.PROSPECT_BASE_URL || "https://api-v1-westeurope.prospect365.com";
    this.token = process.env.PROSPECT_PAT || "";

    if (!this.token) {
      throw new Error(
        "PROSPECT_PAT environment variable is required. " +
        "Generate a Personal Access Token in Prospect CRM: Settings > Integrations > API."
      );
    }
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
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
   * Fetch with automatic retry on 429 (rate limit).
   */
  private async fetchWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
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
}

/** Singleton client instance */
let _client: ProspectClient | null = null;

export function getClient(): ProspectClient {
  if (!_client) {
    _client = new ProspectClient();
  }
  return _client;
}
