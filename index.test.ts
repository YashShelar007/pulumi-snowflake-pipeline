// Runs index.ts against Pulumi mocks: no AWS or Snowflake calls, no credentials.
// `npm test` compiles to bin/ and runs this file from the repo root.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pulumi from "@pulumi/pulumi";

const program = pulumi.runtime
  .setMocks(
    {
      newResource: (args) => ({ id: `${args.name}-id`, state: args.inputs }),
      call: (args) => args.inputs,
    },
    "pulumi-snowflake-pipeline",
    "dev",
  )
  .then(() => import("./index"));

const valueOf = <T>(output: pulumi.Output<T>) =>
  new Promise<T>((resolve) => output.apply(resolve));

test("snowflake/setup.sql uses the names the program creates", async () => {
  const { snowflakeOutputs: created } = await program;
  const sql = readFileSync("snowflake/setup.sql", "utf8");
  const nameIn = (statement: string) =>
    sql.match(new RegExp(`^${statement} (\\S+);`, "m"))?.[1];

  assert.equal(nameIn("USE WAREHOUSE"), await valueOf(created.warehouseName));
  assert.equal(nameIn("USE DATABASE"), await valueOf(created.databaseName));
  assert.equal(nameIn("USE SCHEMA"), await valueOf(created.schemaName));
  assert.equal(
    nameIn("DESC STORAGE INTEGRATION"),
    await valueOf(created.storageIntegrationName),
  );
});
