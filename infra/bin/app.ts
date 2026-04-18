#!/usr/bin/env node
import "source-map-support/register.js";
import * as cdk from "aws-cdk-lib";
import { SeismicSentryStack } from "../lib/seismic-sentry-stack.js";

const app = new cdk.App();
const environmentName = app.node.tryGetContext("environmentName") ?? "dev";

new SeismicSentryStack(app, `SeismicSentry-${environmentName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID,
    region: process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? "us-west-2"
  },
  environmentName
});
