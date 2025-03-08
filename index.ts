import { z, type Primitive } from "zod";
import { createGraphQLError, throws, type GraphQLResponse } from "./errors.ts";
import "./zodExtensions.ts";

// Type helper to transform an object with Zod schemas into pure TypeScript types
type InferZodShape<T> = {
  [K in keyof T as K extends "_args" ? never : K]: T[K] extends z.ZodType<
    any,
    any
  >
    ? z.infer<T[K]>
    : T[K] extends (infer U)[]
      ? InferZodShape<U>[]
      : T[K] extends object
        ? InferZodShape<T[K]>
        : T[K];
};

export class Query<T, V = Record<string, Primitive>> {
  private constructor(
    private readonly url: string,
    private readonly query: string,
    private readonly schema?: z.ZodType<T>,
  ) {}

  public static fromString<T>(
    url: string,
    queryString: string,
    schema: z.ZodType<T>,
  ): Query<T>;
  public static fromString(url: string, queryString: string): Query<unknown>;
  public static fromString(
    url: string,
    queryString: string,
    schema?: z.ZodType,
  ) {
    return new Query<unknown>(url, queryString, schema);
  }

  public static typed<V extends Record<string, z.ZodType>, T extends object>(
    url: string,
    name: string,
    variables: V,
    query: T,
  ) {
    let argsString = "";
    if (Object.keys(variables).length > 0) {
      argsString =
        "(" +
        Object.entries(variables)
          .map(
            ([v, t]) =>
              `$${v}:${t.name() ?? throws(`variable ${v} type not named`)}`,
          )
          .join(",") +
        ")";
    }
    const queryString = `query ${name}${argsString} {${buildGraphQLQuery(query)}}`;
    console.log("\n\n", queryString, "\n");
    const schema = createZodSchemaFromShape(query);
    return new Query<InferZodShape<T>, InferZodShape<V>>(
      url,
      queryString,
      schema,
    );
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
  const queryParts: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (key === "_args") {
      continue; // Skip _args in this pass, we'll use it when processing the parent
    }

    if (isZodSchema(value)) {
      queryParts.push(key);
    } else if (Array.isArray(value) && value.length > 0) {
      // For arrays, use the first item as a template
      queryParts.push(`${key} { ${buildGraphQLQuery(value[0])} }`);
    } else if (typeof value === "object") {
      // Check if we have arguments for this field
      const args = value["_args"];
      let argsString = "";

      if (args && typeof args === "object") {
        const argParts: string[] = [];
        for (const [argName, argValue] of Object.entries(args)) {
          argParts.push(`${argName}: ${argValue}`);
        }

        if (argParts.length > 0) {
          argsString = `(${argParts.join(", ")})`;
        }
      }

      queryParts.push(`${key}${argsString} { ${buildGraphQLQuery(value)} }`);
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
    if (key === "_args") {
      continue; // Skip _args when building validation schema
    }

    if (isZodSchema(value)) {
      console.log(`key ${key} detected to be a zod type`);
      schemaShape[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      console.log(`key ${key} detected to be an array`);
      const itemSchema = createZodSchemaFromShape(value[0]);
      schemaShape[key] = z.array(itemSchema);
    } else if (typeof value === "object") {
      console.log(`key ${key} detected to be a nested object`);
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
