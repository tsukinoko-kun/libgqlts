import { z } from "zod";
import { createGraphQLError, type GraphQLResponse } from "./errors.ts";

// Type helper to transform an object with Zod schemas into pure TypeScript types
type InferZodShape<T> = {
  [K in keyof T]: T[K] extends z.ZodType<any, any>
    ? z.infer<T[K]>
    : T[K] extends object
      ? InferZodShape<T[K]>
      : T[K];
};

export class Query<T, V extends Record<string, any>> {
  private constructor(
    private readonly url: string,
    private readonly query: string,
    private readonly schema?: z.ZodType<T>,
  ) {}

  public static fromString<T, V extends Record<string, any>>(
    url: string,
    queryString: string,
    schema: z.ZodType<T>,
  ): Query<T, V>;
  public static fromString<V extends Record<string, any>>(
    url: string,
    queryString: string,
  ): Query<unknown, V>;
  public static fromString<V extends Record<string, any>>(
    url: string,
    queryString: string,
    schema?: z.ZodType,
  ) {
    return new Query<unknown, V>(url, queryString, schema);
  }

  public static typed<T extends object, V extends Record<string, any>>(
    url: string,
    name: string,
    query: T,
  ) {
    const queryString = `query ${name} {${buildGraphQLQuery(query)}}`;
    console.log("\n\n", queryString, "\n");
    const schema = createZodSchemaFromShape(query);
    return new Query<InferZodShape<T>, V>(url, queryString, schema);
  }

  public toString() {
    return this.query;
  }

  public async execute(
    variables: V,
    authorization?: { type: string; token: string } | string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Prevent caching in Next.js
      "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
    };
    if (authorization) {
      switch (typeof authorization) {
        case "string":
          headers.Authorization = authorization;
          break;
        case "object":
          headers.Authorization = `${authorization.type} ${authorization.token}`;
          break;
      }
    }

    const fetchOptions = {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: this.query,
        variables: variables || {},
      }),
      cache: "no-store",
      next: {
        revalidate: 0,
        cache: "no-store",
      },
    } as const;

    const resp = await fetch(this.url, fetchOptions);

    if (!resp.ok) {
      throw new Error(await resp.text());
    }

    const respObj: GraphQLResponse<T> = await resp.json();

    if ("data" in respObj && respObj.data) {
      if (this.schema) {
        const zResp = await this.schema.safeParseAsync(respObj.data);
        if (zResp.success) {
          return zResp.data;
        } else {
          throw new Error(zResp.error.toString());
        }
      }
      return respObj.data;
    }

    throw createGraphQLError(respObj);
  }
}

// Helper function to build GraphQL query string
function buildGraphQLQuery(shape: object): string {
  // Implementation to convert the shape to GraphQL query string
  // This is just a simplified example
  const queryParts: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (value instanceof z.ZodType) {
      queryParts.push(key);
    } else if (typeof value === "object") {
      queryParts.push(`${key} { ${buildGraphQLQuery(value)} }`);
    }
  }

  return queryParts.join(" ");
}

/**
 * Type guard to check if a value is a Zod schema
 */
function isZodSchema(value: unknown): value is z.ZodType {
  if (value === null || typeof value !== "object") {
    return false;
  }

  // Check for the essential methods and properties that all Zod schemas have
  return (
    typeof (value as z.ZodType).parse === "function" &&
    typeof (value as z.ZodType).safeParse === "function" &&
    typeof (value as z.ZodType)._def === "object"
  );
}

// Helper function to create Zod schema from shape
function createZodSchemaFromShape(shape: object): z.ZodType {
  const schemaShape: Record<string, z.ZodType> = {};

  for (const [key, value] of Object.entries(shape)) {
    if (isZodSchema(value)) {
      console.log(`key ${key} detected to be a zod type`);
      schemaShape[key] = value;
    } else if (typeof value === "object") {
      console.log(`key ${key} detected to be a nested object`);
      // Create a nested schema directly instead of trying to pass a ZodType to z.object()
      schemaShape[key] = createZodSchemaFromShape(value);
    } else {
      console.warn(
        `unexpected type <${typeof value}> in query shape key [${key}]`,
      );
      throw new Error(
        `unexpected type <${typeof value}> in query shape key [${key}]`,
      );
    }
  }

  return z.object(schemaShape);
}
