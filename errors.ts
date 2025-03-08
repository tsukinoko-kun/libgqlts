export function throws(message?: string, options?: ErrorOptions): never {
  throw new Error(message, options);
}
/**
 * Creates an Error from a GraphQL response containing errors
 * @param respObj - The GraphQL response object
 * @returns An Error object with formatted message or null if no errors
 */
export function createGraphQLError<T>(
  respObj: GraphQLResponse<T>,
): Error | null {
  // Return null if there are no errors
  if (
    !("errors" in respObj) ||
    !respObj.errors ||
    !Array.isArray(respObj.errors) ||
    respObj.errors.length === 0
  ) {
    return null;
  }

  // Format a detailed error message from all errors
  const formattedMessage = respObj.errors
    .map((error) => {
      let message = `GraphQL Error: ${error.message}`;

      // Add location info if available
      if (error.locations && error.locations.length > 0) {
        const locationStr = error.locations
          .map((loc) => `[line: ${loc.line}, column: ${loc.column}]`)
          .join(", ");
        message += `\nLocation: ${locationStr}`;
      }

      // Add path info if available
      if (error.path && error.path.length > 0) {
        message += `\nPath: ${error.path.join(".")}`;
      }

      return message;
    })
    .join("\n\n");

  // Create and return the Error object
  const error = new Error(formattedMessage);

  // Attach the original errors for reference
  (error as any).graphqlErrors = respObj.errors;

  return error;
}

type GraphQLErrorLocation = {
  line: number;
  column: number;
};

type GraphQLError = {
  message: string;
  locations?: GraphQLErrorLocation[];
  path?: string[];
  extensions?: Record<string, any>;
};

export type GraphQLResponse<T> =
  | {
      data: T;
    }
  | {
      errors: GraphQLError[];
    };
