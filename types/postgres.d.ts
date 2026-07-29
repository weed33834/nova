/**
 * Ambient type declarations for the optional `postgres` (postgres.js) dependency.
 *
 * This package is only needed when DATABASE_URL is set to a PostgreSQL
 * connection string. It is not installed by default, so TypeScript needs
 * these minimal declarations to compile the dynamic import in
 * lib/db/pg-client.ts.
 *
 * When the package IS installed, its real type declarations take precedence
 * over these ambient stubs.
 */

declare module 'postgres' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PostgresError extends Error {
    code?: string;
  }

  interface PostgresOptions {
    max?: number;
    ssl?: boolean | { rejectUnauthorized?: boolean };
    connect_timeout?: number;
    options?: string;
    idle_timeout?: number;
    prepare?: boolean;
    transform?: unknown;
    connection?: unknown;
    fetch_types?: boolean;
    onnotice?: (notice: unknown) => void;
    onparameter?: (key: string, value: unknown) => void;
    debug?: (connection: number, query: string, parameters: unknown[], types: unknown[]) => void;
  }

  interface PendingQuery<T> extends Promise<T> {
    simple(): PendingQuery<T>;
    unsafe(): PendingQuery<T>;
    file(path: string): PendingQuery<T>;
    cursor(rows?: number): AsyncIterable<unknown>;
    describe(): Promise<unknown>;
  }

  interface Sql {
    <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): PendingQuery<T>;
    unsafe<T = unknown>(query: string, params?: unknown[]): PendingQuery<T>;
    file<T = unknown>(path: string): PendingQuery<T>;
    end(options?: { timeout?: number }): Promise<void>;
    reserve(): Promise<Sql>;
    begin<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  }

  function postgres(url: string, options?: PostgresOptions): Sql;

  export default postgres;
  export { postgres };
}
