// Runs index.ts against Pulumi mocks: no AWS or Snowflake calls, no credentials.
// `npm test` compiles to bin/ and runs this file from the repo root.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pulumi from "@pulumi/pulumi";

const inputsByType: Record<string, any> = {};
const program = pulumi.runtime
  .setMocks(
    {
      newResource: (args) => {
        inputsByType[args.type] = args.inputs;
        return { id: `${args.name}-id`, state: args.inputs };
      },
      call: (args) => args.inputs,
    },
    "pulumi-snowflake-pipeline",
    "dev",
  )
  .then(() => {
    pulumi.runtime.setConfig("pulumi-snowflake-pipeline:awsAccountId", "111111111111");
    return import("./index");
  });

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

test("instructions copy each sample file with its own file format", async () => {
  const text = await valueOf((await program).instructions);
  const copyOf = (file: string) =>
    text.match(/COPY INTO[^;]*;/g)?.find((copy) => copy.includes(`'${file}'`)) ?? "";

  assert.match(copyOf("sample.csv"), /FORMAT_NAME = CSV_FORMAT/);
  assert.match(copyOf("yellow_tripdata_2024-01.parquet"), /FORMAT_NAME = PARQUET_FORMAT/);
});

test("first deploy: bucket and trust policy use the configured account", async () => {
  const { awsOutputs } = await program;
  assert.equal(await valueOf(awsOutputs.bucketName), "data-pipeline-data-dev-111111111111");

  await valueOf(awsOutputs.roleName);
  const [trust] = JSON.parse(inputsByType["aws:iam/role:Role"].assumeRolePolicy).Statement;
  assert.equal(trust.Principal.AWS, "arn:aws:iam::111111111111:root");
  assert.equal(trust.Condition.StringEquals["sts:ExternalId"], "0000");
});
