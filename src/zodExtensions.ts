import { z } from "zod";
export { z };

declare module "zod" {
  interface ZodType {
    named(name: string): this;
    name(): string | undefined;
  }
}

// Store schema names without modifying the schemas directly
const schemaNames = new WeakMap<z.ZodType, string>();

// Add the named method
z.ZodType.prototype.named = function (name: string) {
  schemaNames.set(this, name);
  return this;
};

// Add the name getter method
z.ZodType.prototype.name = function () {
  return schemaNames.get(this);
};
