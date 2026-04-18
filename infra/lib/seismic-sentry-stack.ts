import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sagemaker from "aws-cdk-lib/aws-sagemaker";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SeismicSentryStackProps extends cdk.StackProps {
  environmentName: string;
}

export class SeismicSentryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SeismicSentryStackProps) {
    super(scope, id, props);

    const allowedCorsOrigin = this.node.tryGetContext("allowedCorsOrigin") ?? "*";
    const alertEmail = this.node.tryGetContext("alertEmail") ?? "";
    const enableSageMaker = this.node.tryGetContext("enableSageMaker") === "true";
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

    const siteBucket = new s3.Bucket(this, "DashboardBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const distribution = new cloudfront.Distribution(this, "DashboardDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html"
        }
      ]
    });

    const sitesTable = new dynamodb.Table(this, "SitesTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const resultsTable = new dynamodb.Table(this, "ResultsTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY
    });

    const alertTopic = new sns.Topic(this, "EmergencyAlertTopic", {
      displayName: `SeismicSentry ${props.environmentName} emergency alerts`
    });

    if (alertEmail) {
      alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    const apiRole = new iam.Role(this, "ApiLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")]
    });
    resultsTable.grantReadWriteData(apiRole);
    sitesTable.grantReadWriteData(apiRole);
    alertTopic.grantPublish(apiRole);
    apiRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sagemaker:InvokeEndpoint"],
        resources: ["*"]
      })
    );

    const commonEnvironment = {
      CORS_ALLOW_ORIGIN: allowedCorsOrigin,
      RESULTS_TABLE_NAME: resultsTable.tableName,
      SITES_TABLE_NAME: sitesTable.tableName,
      ALERT_TOPIC_ARN: alertTopic.topicArn,
      SAGEMAKER_ENDPOINT_NAME: `${id.toLowerCase()}-endpoint`,
      STACK_NAME: id,
      USE_LOCAL_INFERENCE: "true"
    };

    const health = new nodejs.NodejsFunction(this, "HealthFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/health.ts"),
      role: apiRole,
      timeout: Duration.seconds(5),
      memorySize: 256,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const catalog = new nodejs.NodejsFunction(this, "CatalogFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/catalog.ts"),
      role: apiRole,
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const orchestrator = new nodejs.NodejsFunction(this, "ScenarioOrchestratorFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/orchestrator.ts"),
      role: apiRole,
      timeout: Duration.seconds(20),
      memorySize: 1024,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const report = new nodejs.NodejsFunction(this, "ReportFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/report.ts"),
      role: apiRole,
      timeout: Duration.seconds(30),
      memorySize: 1024,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowHeaders: ["content-type", "authorization"],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS
        ],
        allowOrigins: [allowedCorsOrigin]
      }
    });

    httpApi.addRoutes({
      path: "/health",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", health)
    });

    httpApi.addRoutes({
      path: "/scenarios",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ScenariosIntegration", catalog)
    });

    httpApi.addRoutes({
      path: "/sites",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("SitesIntegration", catalog)
    });

    httpApi.addRoutes({
      path: "/scenarios/{scenarioId}/run",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("RunScenarioIntegration", orchestrator)
    });

    httpApi.addRoutes({
      path: "/reports/resilience",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("ReportIntegration", report)
    });

    const graphqlApi = new appsync.GraphqlApi(this, "RealtimeApi", {
      name: `seismic-sentry-${props.environmentName}`,
      definition: appsync.Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(Duration.days(30))
          }
        }
      },
      xrayEnabled: true
    });

    const noneDataSource = graphqlApi.addNoneDataSource("RealtimeNoneDataSource");
    noneDataSource.createResolver("PublishScenarioRunResolver", {
      typeName: "Mutation",
      fieldName: "publishScenarioRun",
      requestMappingTemplate: appsync.MappingTemplate.fromString("{\"version\":\"2018-05-29\",\"payload\":$util.toJson($context.arguments.input)}"),
      responseMappingTemplate: appsync.MappingTemplate.fromString("$util.toJson($context.result)")
    });

    const fisRole = new iam.Role(this, "FisExperimentRole", {
      assumedBy: new iam.ServicePrincipal("fis.amazonaws.com")
    });
    fisRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:PutFunctionConcurrency", "lambda:DeleteFunctionConcurrency", "dynamodb:UpdateTable"],
        resources: ["*"]
      })
    );

    new cloudwatch.Dashboard(this, "OpsDashboard", {
      dashboardName: `SeismicSentry-${props.environmentName}`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "API latency",
            left: [orchestrator.metricDuration()],
            width: 12
          }),
          new cloudwatch.GraphWidget({
            title: "Lambda errors",
            left: [health.metricErrors(), catalog.metricErrors(), orchestrator.metricErrors(), report.metricErrors()],
            width: 12
          })
        ]
      ]
    });

    if (enableSageMaker) {
      this.createOptionalSageMakerEndpoint(id);
    }

    new cdk.CfnOutput(this, "DashboardBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "CloudFrontUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "GraphqlUrl", { value: graphqlApi.graphqlUrl });
    new cdk.CfnOutput(this, "EmergencyAlertTopicArn", { value: alertTopic.topicArn });
    new cdk.CfnOutput(this, "FisRoleArn", { value: fisRole.roleArn });
  }

  private createOptionalSageMakerEndpoint(id: string) {
    const modelArtifactBucket = this.node.tryGetContext("modelArtifactBucket");
    const modelArtifactKey = this.node.tryGetContext("modelArtifactKey");
    const containerImage = this.node.tryGetContext("sagemakerContainerImage");

    if (!modelArtifactBucket || !modelArtifactKey || !containerImage) {
      throw new Error("enableSageMaker=true requires modelArtifactBucket, modelArtifactKey, and sagemakerContainerImage context values.");
    }

    const role = new iam.Role(this, "SageMakerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")]
    });

    const model = new sagemaker.CfnModel(this, "FailureModel", {
      executionRoleArn: role.roleArn,
      primaryContainer: {
        image: containerImage,
        modelDataUrl: `s3://${modelArtifactBucket}/${modelArtifactKey}`
      }
    });

    const endpointConfig = new sagemaker.CfnEndpointConfig(this, "FailureEndpointConfig", {
      productionVariants: [
        {
          initialInstanceCount: 1,
          initialVariantWeight: 1,
          instanceType: "ml.t2.medium",
          modelName: model.attrModelName,
          variantName: "primary"
        }
      ]
    });

    new sagemaker.CfnEndpoint(this, "FailureEndpoint", {
      endpointName: `${id.toLowerCase()}-endpoint`,
      endpointConfigName: endpointConfig.attrEndpointConfigName
    });
  }
}
