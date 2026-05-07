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
        details?: Array<{
            code: string;
            message: string;
            target?: string;
        }>;
    };
}
export interface ProspectCredentials {
    PROSPECT_PAT: string;
    PROSPECT_BASE_URL: string;
    PROSPECT_PROFILE_ID: string;
    PROSPECT_USER_ID: string;
    PROSPECT_LOCALE: string;
}
/**
 * Resolve credentials from env vars first, then ~/.prospect-crm/config.json
 * as a fallback for plugin users who ran scripts/setup.cjs instead of
 * editing claude_desktop_config.json. Throws an actionable error if no
 * PAT can be found anywhere.
 *
 * Precedence: process env > config file > built-in defaults (where they apply).
 * Env wins for every individual key — a user can override one value via env
 * while leaving the rest in the config file.
 */
export declare function loadCredentials(): ProspectCredentials;
export declare class ProspectClient {
    private baseUrl;
    private token;
    private profileId;
    private locale;
    private userId;
    private apiUserEmail;
    private apiUserEmailError;
    private apiUserEmailPromise;
    private retryDelayMs;
    private maxRetries;
    constructor();
    /**
     * Ensure this.profileId is populated. If not set via env var, resolve it by
     * calling GET /Info() — which returns { ProfileId, UserId, ... } keyed off
     * the PAT's tenant. Runs at most once per process.
     */
    private ensureProfileId;
    private get headers();
    /**
     * Execute a GET request against the OData API.
     */
    get<T>(entitySet: string, queryParams?: string): Promise<ODataResponse<T>>;
    /**
     * GET a single entity by key.
     * Prospect OData wraps even single-entity responses in { value: [...] },
     * so we unwrap automatically.
     */
    getById<T>(entitySet: string, id: number | string, queryParams?: string): Promise<T>;
    /**
     * POST to create a new entity.
     */
    post<T>(entitySet: string, body: Record<string, unknown>): Promise<T>;
    /**
     * PATCH to update an existing entity.
     */
    patch<T>(entitySet: string, id: number | string, body: Record<string, unknown>): Promise<T>;
    /**
     * DELETE an entity.
     */
    delete(entitySet: string, id: number | string): Promise<void>;
    /**
     * GET a URL path and return raw bytes + content-type. Used for bound functions
     * like /Documents(id)/Raw() that stream a file back rather than JSON.
     */
    getBinary(pathAfterBase: string): Promise<{
        bytes: Buffer;
        contentType: string;
    }>;
    /**
     * Invoke a bound OData action on a single entity — POST /{entitySet}({id})/{actionName}().
     * Bare form (no namespace prefix) per the form Prospect's own UI uses. The "Default."
     * alias documented in Swagger is a no-op on the regional host.
     *
     * Used for MergeData / SendMessage / Confirm / Copy / Recalculate etc.
     * Prospect wraps scalar return values in { "@odata.context": ..., "value": <scalar> }.
     */
    invokeAction<T>(entitySet: string, id: number | string, actionName: string, body?: Record<string, unknown>): Promise<T>;
    /**
     * Invoke an unbound or collection-bound action — POST /{entitySet}/{actionName}.
     * Used for e.g. /DocumentAttachments/AttachExistingDocument. Note: no trailing
     * parens in the URL, matching the form the Prospect UI uses for these.
     */
    invokeCollectionAction<T>(entitySet: string, actionName: string, body?: Record<string, unknown>): Promise<T>;
    /**
     * Fetch with automatic retry on 429 (rate limit).
     */
    private fetchWithRetry;
    /**
     * Resolve the email address of the API user this server authenticates as.
     * Cached per process. Used by the safety gate in send_quote_email so
     * customer email is impossible from this MCP. Throws (and caches the
     * error) if PROSPECT_USER_ID is unset, the lookup fails, or the user
     * has no email on file. Callers that want to refuse-on-failure should
     * surface the error verbatim — no silent fallback.
     */
    getApiUserEmail(): Promise<string>;
}
export declare function getClient(): ProspectClient;
//# sourceMappingURL=client.d.ts.map