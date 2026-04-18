# Architecture

## Request Flow

1. React dashboard is hosted from S3 through CloudFront.
2. API Gateway receives scenario execution requests.
3. Lambda loads site features, joins PGV/Vs30/capacity inputs, and invokes SageMaker.
4. DynamoDB stores run results and the site registry.
5. SNS fans out emergency alerts when predicted capacity loss crosses the configured threshold.
6. AppSync subscriptions are reserved for live map updates after the first scenario API path is stable.

## Cost Guardrails

- DynamoDB uses on-demand billing.
- Lambda uses modest memory sizes and short timeouts.
- SageMaker endpoint creation is disabled unless `--context enableSageMaker=true`.
- S3 buckets are marked destroyable for hackathon cleanup. Change removal policies before production.

## Regional Resilience

The initial CDK stack is single-region to keep the first deploy fast. The intended two-day path is:

1. Deploy the same stack in `us-west-2` and `us-east-1`.
2. Put both HTTP APIs behind Route 53 Application Recovery Controller.
3. Use the FIS template to degrade the primary region.
4. Record recovery time and generate the resilience report.
